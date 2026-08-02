import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const mocks = vi.hoisted(() => ({
  clearGoogleAccessTokenCache: vi.fn(),
  decryptSecret: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/config", () => ({
  googleRiscClientIds: () => ["google-client-id"],
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: mocks.decryptSecret,
}));

vi.mock("@/lib/db", () => ({
  db: {
    gmailSender: {
      deleteMany: mocks.deleteMany,
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("@/lib/email/sender", () => ({
  clearGoogleAccessTokenCache: mocks.clearGoogleAccessTokenCache,
}));

import {
  GOOGLE_RISC_EVENTS,
  googleRefreshTokenDoubleHash,
  processGoogleRiscEvent,
  shouldDisconnectGmailSender,
  type GoogleRiscPayload,
  verifyGoogleRiscToken,
} from "@/lib/google/risc";

const sender = {
  id: "global",
  email: "sender@example.com",
  googleSubject: "google-subject-1",
  refreshTokenEncrypted: "encrypted-refresh-token",
};

function payload(
  eventType: string,
  event: Record<string, unknown>,
): GoogleRiscPayload {
  return {
    iss: "https://accounts.google.com/",
    aud: "google-client-id",
    iat: 1_728_000_000,
    jti: "event-1",
    events: { [eventType]: event },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decryptSecret.mockReturnValue("abcdefghijklmnop-rest-of-token");
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue(sender);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Cross-Account Protection events", () => {
  it("verifies Google's signature, issuer, and audience without expiring historical events", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    Object.assign(publicJwk, { alg: "RS256", kid: "test-key", use: "sig" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes(".well-known/risc-configuration")) {
          return Response.json({
            issuer: "https://accounts.google.com/",
            jwks_uri: "https://keys.example.test/google-risc",
          });
        }
        if (url === "https://keys.example.test/google-risc") {
          return Response.json({ keys: [publicJwk] });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const claims = {
      iss: "https://accounts.google.com/",
      aud: "google-client-id",
      iat: 1_728_000_000,
      exp: 1,
      jti: "signed-event-1",
      events: {
        [GOOGLE_RISC_EVENTS.verification]: { state: "test-state" },
      },
    };
    const validToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .sign(privateKey);

    await expect(verifyGoogleRiscToken(validToken)).resolves.toMatchObject({
      jti: "signed-event-1",
      aud: "google-client-id",
    });

    const wrongAudienceToken = await new SignJWT({
      ...claims,
      aud: "another-client-id",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .sign(privateKey);
    await expect(verifyGoogleRiscToken(wrongAudienceToken)).rejects.toThrow(
      "audience",
    );

    const missingKeyIdToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256" })
      .sign(privateKey);
    await expect(verifyGoogleRiscToken(missingKeyIdToken)).rejects.toThrow(
      "header",
    );
  });

  it("matches an account-wide revocation to the stored Google subject", () => {
    expect(
      shouldDisconnectGmailSender(
        payload(GOOGLE_RISC_EVENTS.tokensRevoked, {
          subject: {
            subject_type: "iss-sub",
            sub: "google-subject-1",
          },
        }),
        sender,
      ),
    ).toBe(true);
  });

  it("does not disconnect a different Google account", () => {
    expect(
      shouldDisconnectGmailSender(
        payload(GOOGLE_RISC_EVENTS.accountDisabled, {
          subject: {
            subject_type: "iss-sub",
            sub: "another-google-subject",
          },
        }),
        sender,
      ),
    ).toBe(false);
  });

  it("matches a revoked refresh token by its Google prefix identifier", () => {
    expect(
      shouldDisconnectGmailSender(
        payload(GOOGLE_RISC_EVENTS.tokenRevoked, {
          subject: {
            subject_type: "oauth_token",
            token_type: "refresh_token",
            token_identifier_alg: "prefix",
            token: "abcdefghijklmnop",
          },
        }),
        sender,
      ),
    ).toBe(true);
  });

  it("matches a revoked refresh token by its double SHA-512 identifier", () => {
    const refreshToken = "abcdefghijklmnop-rest-of-token";
    expect(
      shouldDisconnectGmailSender(
        payload(GOOGLE_RISC_EVENTS.tokenRevoked, {
          subject: {
            subject_type: "oauth_token",
            token_type: "refresh_token",
            token_identifier_alg: "hash_base64_sha512_sha512",
            token: googleRefreshTokenDoubleHash(refreshToken),
          },
        }),
        sender,
      ),
    ).toBe(true);
  });

  it("deletes the sender and clears cached access after a matching event", async () => {
    await processGoogleRiscEvent(
      payload(GOOGLE_RISC_EVENTS.accountCredentialChangeRequired, {
        subject: { sub: "google-subject-1" },
      }),
    );

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: "global" },
    });
    expect(mocks.clearGoogleAccessTokenCache).toHaveBeenCalledOnce();
  });

  it("accepts verification events without changing the sender", async () => {
    await processGoogleRiscEvent(
      payload(GOOGLE_RISC_EVENTS.verification, { state: "test-state" }),
    );

    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.clearGoogleAccessTokenCache).not.toHaveBeenCalled();
  });
});
