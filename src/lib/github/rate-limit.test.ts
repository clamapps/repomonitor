import { describe, expect, it } from "vitest";

import {
  GITHUB_DEFAULT_HOURLY_LIMIT,
  GitHubRateLimitTracker,
} from "@/lib/github/rate-limit";

const noHeaders = {
  limit: null,
  remaining: null,
  reset: null,
  retryAfter: null,
};

describe("GitHub rate limit tracking", () => {
  it("uses the lower anonymous limit and the authenticated limit separately", () => {
    const tracker = new GitHubRateLimitTracker();
    const now = Date.UTC(2026, 6, 28);

    for (let index = 0; index < GITHUB_DEFAULT_HOURLY_LIMIT.anonymous; index += 1) {
      expect(tracker.reserve("anonymous", "anonymous", now)).toBeNull();
    }
    expect(tracker.reserve("anonymous", "anonymous", now)).toMatchObject({
      remaining: 0,
    });

    expect(
      tracker.reserve("token:a", "authenticated", now),
    ).toBeNull();
  });

  it("keeps authenticated credentials in independent buckets", () => {
    const tracker = new GitHubRateLimitTracker();
    const now = Date.UTC(2026, 6, 28);

    tracker.recordResponse(
      "token:a",
      "authenticated",
      { ...noHeaders, remaining: "0", reset: String(now / 1_000 + 60) },
      200,
      "",
      now,
    );

    expect(tracker.reserve("token:a", "authenticated", now)).not.toBeNull();
    expect(tracker.reserve("token:b", "authenticated", now)).toBeNull();
  });

  it("does not restore budget when concurrent responses arrive out of order", () => {
    const tracker = new GitHubRateLimitTracker();
    const now = Date.UTC(2026, 6, 28);
    const reset = String(now / 1_000 + 3_600);

    expect(tracker.reserve("anonymous", "anonymous", now)).toBeNull();
    expect(tracker.reserve("anonymous", "anonymous", now)).toBeNull();
    tracker.recordResponse(
      "anonymous",
      "anonymous",
      { ...noHeaders, remaining: "58", reset },
      200,
      "",
      now,
    );
    tracker.recordResponse(
      "anonymous",
      "anonymous",
      { ...noHeaders, remaining: "59", reset },
      200,
      "",
      now,
    );

    for (let index = 0; index < 58; index += 1) {
      expect(tracker.reserve("anonymous", "anonymous", now)).toBeNull();
    }
    expect(tracker.reserve("anonymous", "anonymous", now)).not.toBeNull();
  });

  it("honors GitHub's remaining and reset headers", () => {
    const tracker = new GitHubRateLimitTracker();
    const now = Date.UTC(2026, 6, 28);
    const reset = now + 30_000;

    tracker.recordResponse(
      "anonymous",
      "anonymous",
      {
        ...noHeaders,
        limit: "60",
        remaining: "0",
        reset: String(reset / 1_000),
      },
      403,
      "",
      now,
    );

    expect(tracker.reserve("anonymous", "anonymous", now)).toEqual({
      remaining: 0,
      retryAfterSeconds: 30,
    });
    expect(tracker.reserve("anonymous", "anonymous", reset)).toBeNull();
  });

  it("honors secondary-limit retry-after headers", () => {
    const tracker = new GitHubRateLimitTracker();
    const now = Date.UTC(2026, 6, 28);

    tracker.recordResponse(
      "anonymous",
      "anonymous",
      { ...noHeaders, remaining: "42", retryAfter: "90" },
      429,
      "",
      now,
    );

    expect(tracker.reserve("anonymous", "anonymous", now)).toEqual({
      remaining: 42,
      retryAfterSeconds: 90,
    });
    expect(
      tracker.reserve("anonymous", "anonymous", now + 90_000),
    ).toBeNull();
  });

  it("waits one minute for a secondary limit without retry-after", () => {
    const tracker = new GitHubRateLimitTracker();
    const now = Date.UTC(2026, 6, 28);

    tracker.recordResponse(
      "anonymous",
      "anonymous",
      { ...noHeaders, remaining: "42" },
      403,
      '{"message":"You have exceeded a secondary rate limit."}',
      now,
    );

    expect(tracker.reserve("anonymous", "anonymous", now)).toEqual({
      remaining: 42,
      retryAfterSeconds: 60,
    });
    expect(
      tracker.reserve("anonymous", "anonymous", now + 60_000),
    ).toBeNull();
  });
});
