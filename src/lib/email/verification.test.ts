import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  addressFindUnique: vi.fn(),
  addressCount: vi.fn(),
  addressUpsert: vi.fn(),
  addressUpdate: vi.fn(),
  sendFindFirst: vi.fn(),
  sendCount: vi.fn(),
  sendCreate: vi.fn(),
  sendDeleteMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  sendEmail: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  EmailSource: { GITHUB: "GITHUB", CUSTOM: "CUSTOM" },
}));

vi.mock("@/lib/config", () => ({
  config: () => ({ APP_URL: "https://repomonitor.example.com" }),
}));

vi.mock("@/lib/crypto", () => ({
  hashToken: (value: string) => `hashed:${value}`,
  randomToken: () => "token-1",
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    emailAddress: {
      findUnique: mocks.addressFindUnique,
      count: mocks.addressCount,
      upsert: mocks.addressUpsert,
      update: mocks.addressUpdate,
    },
    emailVerificationSend: {
      findFirst: mocks.sendFindFirst,
      count: mocks.sendCount,
      create: mocks.sendCreate,
      deleteMany: mocks.sendDeleteMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/email/sender", () => ({
  sendEmail: mocks.sendEmail,
}));

import {
  EmailVerificationError,
  requestEmailVerification,
  verifyEmailToken,
} from "@/lib/email/verification";

const tx = {
  emailAddress: { upsert: mocks.addressUpsert, update: mocks.addressUpdate },
  emailVerificationSend: {
    create: mocks.sendCreate,
    deleteMany: mocks.sendDeleteMany,
  },
  user: { update: mocks.userUpdate },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  mocks.addressFindUnique.mockResolvedValue(null);
  mocks.addressCount.mockResolvedValue(0);
  mocks.sendFindFirst.mockResolvedValue(null);
  mocks.sendCount.mockResolvedValue(0);
  mocks.userFindUnique.mockResolvedValue({ notificationEmailId: null });
  mocks.sendEmail.mockResolvedValue(undefined);
});

describe("verification send throttling", () => {
  it("records each send so the throttle has a durable history", async () => {
    await requestEmailVerification("user-1", "Person@Example.com ");

    expect(mocks.sendCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", email: "person@example.com" },
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("blocks an immediate resend to the same address", async () => {
    mocks.sendFindFirst.mockResolvedValue({ createdAt: new Date() });

    await expect(
      requestEmailVerification("user-1", "person@example.com"),
    ).rejects.toThrow(EmailVerificationError);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("blocks cycling through fresh addresses once the hourly cap is reached", async () => {
    // No prior send to this specific address, but the account is at its cap.
    mocks.sendCount.mockResolvedValue(5);

    await expect(
      requestEmailVerification("user-1", "victim@example.com"),
    ).rejects.toThrow(/Too many verification emails/);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("caps how many addresses one account can hold", async () => {
    mocks.addressCount.mockResolvedValue(10);

    await expect(
      requestEmailVerification("user-1", "another@example.com"),
    ).rejects.toThrow(/maximum number of email addresses/);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("counts a send even when delivery throws", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("sendmail exited with 1"));

    await expect(
      requestEmailVerification("user-1", "person@example.com"),
    ).rejects.toThrow();
    expect(mocks.sendCreate).toHaveBeenCalled();
  });

  it("prunes send rows outside the retention window", async () => {
    await requestEmailVerification("user-1", "person@example.com");

    expect(mocks.sendDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
      }),
    );
  });
});

describe("verification confirmation", () => {
  const pending = {
    id: "addr-1",
    userId: "user-1",
    email: "person@example.com",
    verificationExpires: new Date(Date.now() + 60_000),
  };

  it("rejects a token confirmed by a different account", async () => {
    mocks.addressFindUnique.mockResolvedValue(pending);

    await expect(verifyEmailToken("token-1", "attacker")).resolves.toBeNull();
    expect(mocks.addressUpdate).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    mocks.addressFindUnique.mockResolvedValue({
      ...pending,
      verificationExpires: new Date(Date.now() - 1),
    });

    await expect(verifyEmailToken("token-1", "user-1")).resolves.toBeNull();
    expect(mocks.addressUpdate).not.toHaveBeenCalled();
  });

  it("does not steal a selection the account already made", async () => {
    mocks.addressFindUnique.mockResolvedValue(pending);
    mocks.userFindUnique.mockResolvedValue({ notificationEmailId: "addr-9" });

    await expect(verifyEmailToken("token-1", "user-1")).resolves.toBe(
      "person@example.com",
    );
    expect(mocks.addressUpdate).toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("selects the first verified address when none is chosen yet", async () => {
    mocks.addressFindUnique.mockResolvedValue(pending);

    await expect(verifyEmailToken("token-1", "user-1")).resolves.toBe(
      "person@example.com",
    );
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { notificationEmailId: "addr-1" },
    });
  });
});
