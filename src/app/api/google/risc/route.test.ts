import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processGoogleRiscEvent: vi.fn(),
  verifyGoogleRiscToken: vi.fn(),
}));

vi.mock("@/lib/google/risc", () => ({
  GoogleRiscVerificationUnavailableError: class extends Error {},
  processGoogleRiscEvent: mocks.processGoogleRiscEvent,
  verifyGoogleRiscToken: mocks.verifyGoogleRiscToken,
}));

import { POST } from "@/app/api/google/risc/route";
import { GoogleRiscVerificationUnavailableError } from "@/lib/google/risc";

const validPayload = {
  iss: "https://accounts.google.com/",
  aud: "google-client-id",
  iat: 1_728_000_000,
  jti: "event-1",
  events: {},
};

function eventRequest(contentType = "application/secevent+jwt") {
  return new Request("https://repomonitor.example.com/api/google/risc", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: "signed.security.event",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyGoogleRiscToken.mockResolvedValue(validPayload);
  mocks.processGoogleRiscEvent.mockResolvedValue(undefined);
});

describe("Google RISC receiver", () => {
  it("accepts a valid signed security event", async () => {
    const response = await POST(eventRequest());

    expect(response.status).toBe(202);
    expect(mocks.verifyGoogleRiscToken).toHaveBeenCalledWith(
      "signed.security.event",
    );
    expect(mocks.processGoogleRiscEvent).toHaveBeenCalledWith(validPayload);
  });

  it("rejects an invalid media type before verification", async () => {
    const response = await POST(eventRequest("application/json"));

    expect(response.status).toBe(415);
    expect(mocks.verifyGoogleRiscToken).not.toHaveBeenCalled();
  });

  it("rejects a token that fails signature or claim validation", async () => {
    mocks.verifyGoogleRiscToken.mockRejectedValue(new Error("invalid token"));

    const response = await POST(eventRequest());

    expect(response.status).toBe(400);
    expect(mocks.processGoogleRiscEvent).not.toHaveBeenCalled();
  });

  it("asks Google to retry when signing keys are temporarily unavailable", async () => {
    mocks.verifyGoogleRiscToken.mockRejectedValue(
      new GoogleRiscVerificationUnavailableError("keys unavailable"),
    );

    const response = await POST(eventRequest());

    expect(response.status).toBe(503);
    expect(mocks.processGoogleRiscEvent).not.toHaveBeenCalled();
  });

  it("asks Google to retry when a valid event cannot be processed", async () => {
    mocks.processGoogleRiscEvent.mockRejectedValue(new Error("database down"));

    const response = await POST(eventRequest());

    expect(response.status).toBe(503);
  });
});
