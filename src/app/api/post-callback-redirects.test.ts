import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PUBLIC_APP_URL = "https://repomon.nyanya.org";
const INTERNAL_APP_URL = "https://0.0.0.0:3000";

type TransactionCallback = (tx: {
  user: {
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  gitHubCredential: {
    upsert: ReturnType<typeof vi.fn>;
  };
  emailAddress: {
    upsert: ReturnType<typeof vi.fn>;
  };
}) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  authorizeGitHubAppForPublicPolling: vi.fn(),
  clearGoogleAccessTokenCache: vi.fn(),
  consumeOAuthState: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
  getAuthenticatedEmails: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  gmailSenderUpsert: vi.fn(),
  registerGitHubAppFromManifest: vi.fn(),
  requireRouteAdmin: vi.fn(),
  transaction: vi.fn<(callback: TransactionCallback) => Promise<unknown>>(),
  verifyEmailToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@prisma/client", () => ({
  EmailSource: { GITHUB: "GITHUB" },
}));

vi.mock("@/lib/auth/oauth-state", () => ({
  consumeOAuthState: mocks.consumeOAuthState,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
  destroySession: mocks.destroySession,
  requireRouteAdmin: mocks.requireRouteAdmin,
}));

vi.mock("@/lib/config", () => ({
  config: () => ({
    APP_URL: PUBLIC_APP_URL,
    GITHUB_CLIENT_ID: "github-client-id",
    GITHUB_CLIENT_SECRET: "github-client-secret",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  }),
}));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: mocks.encryptSecret,
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    gmailSender: {
      upsert: mocks.gmailSenderUpsert,
    },
  },
}));

vi.mock("@/lib/email/sender", () => ({
  clearGoogleAccessTokenCache: mocks.clearGoogleAccessTokenCache,
}));

vi.mock("@/lib/email/verification", () => ({
  verifyEmailToken: mocks.verifyEmailToken,
}));

vi.mock("@/lib/github/app", () => ({
  authorizeGitHubAppForPublicPolling:
    mocks.authorizeGitHubAppForPublicPolling,
  registerGitHubAppFromManifest: mocks.registerGitHubAppFromManifest,
}));

vi.mock("@/lib/github/client", () => ({
  getAuthenticatedEmails: mocks.getAuthenticatedEmails,
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { GET as gmailCallback } from "@/app/api/admin/gmail/callback/route";
import { GET as githubAppManifestCallback } from "@/app/api/admin/github-app/manifest/callback/route";
import { GET as githubCallback } from "@/app/api/auth/github/callback/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as verifyEmail } from "@/app/api/email/verify/route";
import { redirectWithMessage } from "@/lib/http";

function redirectLocation(response: Response): URL {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  return new URL(location!);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRouteAdmin.mockResolvedValue({
    id: "admin-1",
    githubId: "1234",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redirects behind a reverse proxy", () => {
  it("uses APP_URL in redirectWithMessage", () => {
    const response = redirectWithMessage(
      new Request(`${INTERNAL_APP_URL}/api/example`),
      "/settings",
      "notice",
      "Saved",
    );

    expect(response.status).toBe(303);
    expect(redirectLocation(response).href).toBe(
      `${PUBLIC_APP_URL}/settings?notice=Saved`,
    );
  });

  it("returns GitHub sign-in callbacks to the public app URL", async () => {
    mocks.consumeOAuthState.mockResolvedValue({
      returnTo: "/subscriptions/subscription-1",
    });
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: 1234,
      login: "octocat",
      name: "The Octocat",
      avatar_url: "https://avatars.example/octocat",
      email: null,
    });
    mocks.getAuthenticatedEmails.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          upsert: vi.fn().mockResolvedValue({
            id: "user-1",
            notificationEmailId: "email-1",
          }),
          update: vi.fn(),
        },
        gitHubCredential: {
          upsert: vi.fn().mockResolvedValue({}),
        },
        emailAddress: {
          upsert: vi.fn(),
        },
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: "github-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await githubCallback(
      new Request(
        `${INTERNAL_APP_URL}/api/auth/github/callback?state=oauth-state&code=github-code`,
      ),
    );

    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(
      "github",
      "oauth-state",
    );
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
    expect(redirectLocation(response).href).toBe(
      `${PUBLIC_APP_URL}/subscriptions/subscription-1`,
    );
  });

  it("returns Gmail callbacks to the public settings URL", async () => {
    mocks.consumeOAuthState.mockResolvedValue({ email: "sender@example.com" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "google-access-token",
              refresh_token: "google-refresh-token",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              email: "sender@example.com",
              email_verified: true,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
    );

    const response = await gmailCallback(
      new Request(
        `${INTERNAL_APP_URL}/api/admin/gmail/callback?state=google-state&code=google-code`,
      ),
    );

    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(
      "google",
      "google-state",
    );
    expect(mocks.gmailSenderUpsert).toHaveBeenCalled();
    const location = redirectLocation(response);
    expect(location.origin).toBe(PUBLIC_APP_URL);
    expect(location.pathname).toBe("/settings");
    expect(location.searchParams.get("notice")).toBe(
      "Google sender connected as sender@example.com",
    );
  });

  it("returns GitHub App registration callbacks to the public settings URL", async () => {
    mocks.consumeOAuthState.mockResolvedValue({ returnTo: "/settings" });
    mocks.registerGitHubAppFromManifest.mockResolvedValue(undefined);

    const response = await githubAppManifestCallback(
      new Request(
        `${INTERNAL_APP_URL}/api/admin/github-app/manifest/callback?state=manifest-state&code=manifest-code`,
      ),
    );

    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(
      "github-app-manifest",
      "manifest-state",
    );
    expect(mocks.registerGitHubAppFromManifest).toHaveBeenCalledWith(
      "manifest-code",
      "admin-1",
    );
    expect(redirectLocation(response).origin).toBe(PUBLIC_APP_URL);
  });

  it("returns logout to the public app URL", async () => {
    const response = await logout(
      new Request(`${INTERNAL_APP_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Origin: PUBLIC_APP_URL },
      }),
    );

    expect(mocks.destroySession).toHaveBeenCalled();
    expect(redirectLocation(response).href).toBe(`${PUBLIC_APP_URL}/`);
  });

  it("returns email verification to the public settings URL", async () => {
    mocks.verifyEmailToken.mockResolvedValue("person@example.com");

    const response = await verifyEmail(
      new Request(
        `${INTERNAL_APP_URL}/api/email/verify?token=verification-token`,
      ),
    );

    expect(mocks.verifyEmailToken).toHaveBeenCalledWith("verification-token");
    const location = redirectLocation(response);
    expect(location.origin).toBe(PUBLIC_APP_URL);
    expect(location.pathname).toBe("/settings");
    expect(location.searchParams.get("notice")).toBe(
      "person@example.com is verified",
    );
  });
});
