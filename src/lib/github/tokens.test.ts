import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  config: () => ({
    GITHUB_CLIENT_ID: "client-id",
    GITHUB_CLIENT_SECRET: "client-secret",
  }),
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: (value: string) => value.replace(/^encrypted:/, ""),
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

vi.mock("@/lib/db", () => ({
  db: {
    gitHubCredential: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

import {
  accessTokenForCredential,
  GitHubAuthorizationError,
} from "@/lib/github/tokens";

type Credential = Parameters<typeof accessTokenForCredential>[0];

function credential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: "cred-1",
    userId: "user-1",
    accessTokenEncrypted: "encrypted:old-access",
    refreshTokenEncrypted: "encrypted:refresh-1",
    scopes: "repo",
    // Already expiring, so a refresh is attempted.
    expiresAt: new Date(Date.now() + 60_000),
    refreshTokenExpiresAt: null,
    invalidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Credential;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.findUnique.mockResolvedValue(credential());
  mocks.update.mockResolvedValue(credential());
});

describe("credential refresh", () => {
  it("keeps the credential usable when GitHub is temporarily unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "server_error" }, 502)),
    );

    await expect(accessTokenForCredential(credential())).rejects.toThrow(
      /temporarily failing/,
    );
    // A 502 must not brick the authorization.
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("invalidates the credential when the refresh token is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "bad_refresh_token" }, 200),
        ),
    );

    await expect(accessTokenForCredential(credential())).rejects.toThrow(
      GitHubAuthorizationError,
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invalidAt: expect.any(Date) }),
      }),
    );
  });

  it("exchanges the rotating refresh token only once for concurrent callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        access_token: "new-access",
        refresh_token: "refresh-2",
        expires_in: 28800,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      accessTokenForCredential(credential()),
      accessTokenForCredential(credential()),
    ]);

    expect(first).toBe("new-access");
    expect(second).toBe("new-access");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a token another request already refreshed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // The stored credential is fresh again by the time this refresh runs.
    mocks.findUnique.mockResolvedValue(
      credential({
        accessTokenEncrypted: "encrypted:new-access",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    );

    await expect(accessTokenForCredential(credential())).resolves.toBe(
      "new-access",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
