import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { compactVerify, createRemoteJWKSet, decodeProtectedHeader } from "jose";
import { z } from "zod";

import { googleRiscClientIds } from "@/lib/config";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { clearGoogleAccessTokenCache } from "@/lib/email/sender";

const RISC_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/risc-configuration";

export const GOOGLE_RISC_EVENTS = {
  accountCredentialChangeRequired:
    "https://schemas.openid.net/secevent/risc/event-type/account-credential-change-required",
  accountDisabled:
    "https://schemas.openid.net/secevent/risc/event-type/account-disabled",
  tokenRevoked:
    "https://schemas.openid.net/secevent/oauth/event-type/token-revoked",
  tokensRevoked:
    "https://schemas.openid.net/secevent/oauth/event-type/tokens-revoked",
  verification:
    "https://schemas.openid.net/secevent/risc/event-type/verification",
} as const;

const discoverySchema = z.object({
  issuer: z.string().min(1),
  jwks_uri: z.string().url(),
});

const payloadSchema = z.object({
  iss: z.string().min(1),
  aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  iat: z.number(),
  jti: z.string().min(1),
  events: z.record(z.string(), z.unknown()),
});

export type GoogleRiscPayload = z.infer<typeof payloadSchema>;

type RiscSubject = {
  email?: unknown;
  sub?: unknown;
  token?: unknown;
  token_identifier_alg?: unknown;
  token_type?: unknown;
};

type RiscEvent = {
  subject?: unknown;
  token_subject?: unknown;
};

type GmailSenderCredential = {
  id: string;
  email: string;
  googleSubject: string | null;
  refreshTokenEncrypted: string;
};

export class GoogleRiscVerificationUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GoogleRiscVerificationUnavailableError";
  }
}

let verificationConfiguration:
  | Promise<{
      issuer: string;
      jwks: ReturnType<typeof createRemoteJWKSet>;
    }>
  | undefined;

async function getVerificationConfiguration() {
  verificationConfiguration ??= (async () => {
    try {
      const response = await fetch(RISC_DISCOVERY_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        throw new Error(`Google RISC discovery failed with ${response.status}`);
      }

      const discovery = discoverySchema.parse(await response.json());
      return {
        issuer: discovery.issuer,
        jwks: createRemoteJWKSet(new URL(discovery.jwks_uri), {
          timeoutDuration: 5_000,
        }),
      };
    } catch (error) {
      verificationConfiguration = undefined;
      throw new GoogleRiscVerificationUnavailableError(
        "Google RISC verification configuration is unavailable",
        { cause: error },
      );
    }
  })();
  return verificationConfiguration;
}

export async function verifyGoogleRiscToken(
  token: string,
): Promise<GoogleRiscPayload> {
  const clientIds = googleRiscClientIds();
  if (clientIds.length === 0) {
    throw new Error("No Google OAuth client IDs are configured");
  }

  const { issuer, jwks } = await getVerificationConfiguration();
  const header = decodeProtectedHeader(token);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Google RISC token header is invalid");
  }
  let verified;
  try {
    verified = await compactVerify(token, jwks, {
      algorithms: ["RS256"],
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? error.code
        : undefined;
    if (
      error instanceof TypeError ||
      code === "ERR_JWKS_TIMEOUT" ||
      code === "ERR_JOSE_GENERIC" ||
      code === "ERR_JWK_INVALID" ||
      code === "ERR_JWKS_INVALID" ||
      code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS"
    ) {
      throw new GoogleRiscVerificationUnavailableError(
        "Google RISC signing keys are unavailable",
        { cause: error },
      );
    }
    throw error;
  }
  const decoded = JSON.parse(
    new TextDecoder().decode(verified.payload),
  ) as unknown;
  const payload = payloadSchema.parse(decoded);

  if (payload.iss !== issuer) {
    throw new Error("Google RISC token issuer is invalid");
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.some((audience) => clientIds.includes(audience))) {
    throw new Error("Google RISC token audience is invalid");
  }

  return payload;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asSubject(value: unknown): RiscSubject | null {
  return asRecord(value) as RiscSubject | null;
}

function equalStrings(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function googleRefreshTokenDoubleHash(token: string): string {
  const firstHash = createHash("sha512").update(token, "utf8").digest();
  return createHash("sha512").update(firstHash).digest("base64");
}

function userSubjectMatches(
  value: unknown,
  sender: GmailSenderCredential,
): boolean {
  const subject = asSubject(value);
  if (!subject) return false;

  if (typeof subject.sub === "string" && sender.googleSubject) {
    return equalStrings(subject.sub, sender.googleSubject);
  }
  return (
    typeof subject.email === "string" &&
    subject.email.toLowerCase() === sender.email.toLowerCase()
  );
}

function tokenSubjectMatches(
  value: unknown,
  encryptedRefreshToken: string,
): boolean {
  const subject = asSubject(value);
  if (
    !subject ||
    subject.token_type !== "refresh_token" ||
    typeof subject.token_identifier_alg !== "string" ||
    typeof subject.token !== "string"
  ) {
    return false;
  }

  const refreshToken = decryptSecret(encryptedRefreshToken);
  if (subject.token_identifier_alg === "prefix") {
    return (
      subject.token.length === 16 && refreshToken.startsWith(subject.token)
    );
  }
  if (subject.token_identifier_alg === "hash_base64_sha512_sha512") {
    return equalStrings(
      subject.token,
      googleRefreshTokenDoubleHash(refreshToken),
    );
  }
  return false;
}

export function shouldDisconnectGmailSender(
  payload: GoogleRiscPayload,
  sender: GmailSenderCredential,
): boolean {
  for (const [eventType, value] of Object.entries(payload.events)) {
    const event = asRecord(value) as RiscEvent | null;
    if (!event) continue;

    if (
      eventType === GOOGLE_RISC_EVENTS.tokenRevoked &&
      tokenSubjectMatches(event.subject, sender.refreshTokenEncrypted)
    ) {
      return true;
    }

    if (
      (eventType === GOOGLE_RISC_EVENTS.tokensRevoked ||
        eventType === GOOGLE_RISC_EVENTS.accountDisabled ||
        eventType === GOOGLE_RISC_EVENTS.accountCredentialChangeRequired) &&
      userSubjectMatches(event.subject, sender)
    ) {
      return true;
    }
  }
  return false;
}

export async function processGoogleRiscEvent(
  payload: GoogleRiscPayload,
): Promise<void> {
  const sender = await db.gmailSender.findUnique({ where: { id: "global" } });
  if (!sender || !shouldDisconnectGmailSender(payload, sender)) return;

  const deleted = await db.gmailSender.deleteMany({ where: { id: sender.id } });
  if (deleted.count > 0) clearGoogleAccessTokenCache();
}
