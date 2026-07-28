export type GitHubRequestMode = "anonymous" | "authenticated";

export const GITHUB_DEFAULT_HOURLY_LIMIT = {
  anonymous: 60,
  authenticated: 5_000,
} as const satisfies Record<GitHubRequestMode, number>;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;

type RateLimitState = {
  limit: number;
  remaining: number;
  resetAt: number;
  blockedUntil: number | null;
};

export type GitHubRateLimitHeaders = {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
  retryAfter: string | null;
};

export type GitHubRateLimitBlock = {
  retryAfterSeconds: number;
  remaining: number;
};

function nonNegativeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function retryAfterTime(value: string | null, now: number): number | null {
  if (value === null) return null;
  const seconds = nonNegativeInteger(value);
  if (seconds !== null) return now + seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : date;
}

/**
 * Keeps each credential (and the process-wide anonymous IP bucket) from making
 * requests after GitHub reports that its primary or secondary limit is spent.
 * GitHub's response headers remain authoritative over the conservative
 * per-process defaults.
 */
export class GitHubRateLimitTracker {
  private readonly states = new Map<string, RateLimitState>();

  reserve(
    key: string,
    mode: GitHubRequestMode,
    now = Date.now(),
  ): GitHubRateLimitBlock | null {
    const state = this.currentState(key, mode, now);
    const unavailableUntil =
      state.blockedUntil && state.blockedUntil > now
        ? state.blockedUntil
        : state.remaining <= 0
          ? state.resetAt
          : null;
    if (unavailableUntil && unavailableUntil > now) {
      return {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((unavailableUntil - now) / 1_000),
        ),
        remaining: state.remaining,
      };
    }

    state.blockedUntil = null;
    state.remaining = Math.max(0, state.remaining - 1);
    return null;
  }

  recordResponse(
    key: string,
    mode: GitHubRequestMode,
    headers: GitHubRateLimitHeaders,
    status: number,
    responseBody = "",
    now = Date.now(),
  ): void {
    const state = this.currentState(key, mode, now);
    const limit = nonNegativeInteger(headers.limit);
    const remaining = nonNegativeInteger(headers.remaining);
    const resetSeconds = nonNegativeInteger(headers.reset);
    const responseResetAt =
      resetSeconds === null ? null : resetSeconds * 1_000;
    const sameWindow =
      responseResetAt === null || responseResetAt === state.resetAt;

    if (limit !== null) state.limit = limit;
    if (remaining !== null) {
      state.remaining = sameWindow
        ? Math.min(state.remaining, remaining)
        : remaining;
    }
    if (responseResetAt !== null) state.resetAt = responseResetAt;

    if (status === 403 || status === 429) {
      const retryAt = retryAfterTime(headers.retryAfter, now);
      if (retryAt !== null && retryAt > now) {
        state.blockedUntil = Math.max(state.blockedUntil ?? 0, retryAt);
      } else if (remaining === 0) {
        state.blockedUntil = Math.max(
          state.blockedUntil ?? 0,
          state.resetAt,
        );
      } else if (/rate limit|abuse detection/i.test(responseBody)) {
        state.blockedUntil = Math.max(
          state.blockedUntil ?? 0,
          now + 60_000,
        );
      }
    }
  }

  private currentState(
    key: string,
    mode: GitHubRequestMode,
    now: number,
  ): RateLimitState {
    let state = this.states.get(key);
    if (!state) {
      const limit = GITHUB_DEFAULT_HOURLY_LIMIT[mode];
      state = {
        limit,
        remaining: limit,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
        blockedUntil: null,
      };
      this.states.set(key, state);
      return state;
    }

    if (state.resetAt <= now) {
      state.remaining = state.limit;
      state.resetAt = now + RATE_LIMIT_WINDOW_MS;
      state.blockedUntil = null;
    }
    return state;
  }
}
