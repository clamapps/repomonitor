import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://repomonitor.example";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  requireRouteUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@prisma/client", () => ({
  EmailSource: { CUSTOM: "CUSTOM" },
}));

vi.mock("@/lib/auth/session", () => ({
  requireRouteUser: mocks.requireRouteUser,
}));

vi.mock("@/lib/config", () => ({
  config: () => ({ APP_URL }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    emailAddress: {
      deleteMany: mocks.deleteMany,
    },
  },
}));

import { POST } from "@/app/api/email/addresses/delete/route";

function removalRequest(emailAddressId: string): Request {
  return new Request(`${APP_URL}/api/email/addresses/delete`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: APP_URL,
    },
    body: new URLSearchParams({ emailAddressId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRouteUser.mockResolvedValue({ id: "user-1" });
});

describe("custom notification email removal", () => {
  it("allows the owner to remove a pending custom address", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    const response = await POST(removalRequest("pending-email-1"));

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "pending-email-1",
        userId: "user-1",
        source: "CUSTOM",
      },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/settings?notice=Email+address+removed`,
    );
  });

  it("does not remove an address outside the user's custom addresses", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    const response = await POST(removalRequest("github-or-other-user-email"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/settings?error=Custom+email+address+not+found`,
    );
  });
});
