import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createOAuthState: vi.fn(),
  requireRouteAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/oauth-state", () => ({
  createOAuthState: mocks.createOAuthState,
}));

vi.mock("@/lib/auth/session", () => ({
  requireRouteAdmin: mocks.requireRouteAdmin,
}));

vi.mock("@/lib/config", () => ({
  config: () => ({
    APP_URL: "https://repomonitor.example.com",
    GOOGLE_CLIENT_ID: "google-client-id",
  }),
  googleOAuthConfigured: () => true,
}));

vi.mock("@/lib/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/http")>(
    "@/lib/http",
  );
  return {
    ...actual,
    assertSameOrigin: mocks.assertSameOrigin,
    redirectWithMessage: vi.fn(),
  };
});

import { POST } from "@/app/api/admin/gmail/start/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createOAuthState.mockResolvedValue("signed-oauth-state");
  mocks.requireRouteAdmin.mockResolvedValue({ id: "admin-1" });
});

describe("Google Gmail authorization", () => {
  it("preserves prior grants and requests only the required scopes", async () => {
    const request = new Request(
      "https://repomonitor.example.com/api/admin/gmail/start",
      {
        method: "POST",
        body: new URLSearchParams({ email: "sender@example.com" }),
      },
    );

    const response = await POST(request);
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("include_granted_scopes")).toBe("true");
    expect(location.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.send",
    ]);
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("state")).toBe("signed-oauth-state");
  });
});
