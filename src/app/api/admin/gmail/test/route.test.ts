import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://repomonitor.example.com";

const mocks = vi.hoisted(() => ({
  requireRouteAdmin: vi.fn(),
  sendGmailEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  requireRouteAdmin: mocks.requireRouteAdmin,
}));

vi.mock("@/lib/config", () => ({
  config: () => ({ APP_URL }),
}));

vi.mock("@/lib/email/sender", () => ({
  sendGmailEmail: mocks.sendGmailEmail,
}));

import { POST } from "@/app/api/admin/gmail/test/route";

function testRequest(to: string): Request {
  return new Request(`${APP_URL}/api/admin/gmail/test`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: APP_URL,
    },
    body: new URLSearchParams({ to }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRouteAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.sendGmailEmail.mockResolvedValue(undefined);
});

describe("Gmail test email", () => {
  it("sends a test message through the connected Gmail sender", async () => {
    const response = await POST(testRequest(" Recipient@Example.com "));

    expect(mocks.sendGmailEmail).toHaveBeenCalledWith({
      to: "recipient@example.com",
      subject: "RepoMonitor test email",
      text: expect.stringContaining("configured Gmail API sender"),
      html: expect.stringContaining("configured Gmail API sender"),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/settings?notice=Test+email+sent+to+recipient%40example.com`,
    );
  });

  it("rejects an invalid recipient without attempting delivery", async () => {
    const response = await POST(testRequest("not-an-email"));

    expect(mocks.sendGmailEmail).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/settings?error=Enter+a+valid+test+email+recipient`,
    );
  });

  it("returns the Gmail delivery error to the settings page", async () => {
    mocks.sendGmailEmail.mockRejectedValue(
      new Error("Gmail send failed (403): Gmail API is disabled"),
    );

    const response = await POST(testRequest("recipient@example.com"));

    expect(response.headers.get("location")).toBe(
      `${APP_URL}/settings?error=Gmail+send+failed+%28403%29%3A+Gmail+API+is+disabled`,
    );
  });
});
