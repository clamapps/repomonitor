import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { githubFetch } from "@/lib/github/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub request authentication", () => {
  it("omits authorization for anonymous public polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "59",
          "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1_000) + 3_600),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await githubFetch("", "/repos/openai/openai-node");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sends bearer authorization when a token is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": "5000",
          "X-RateLimit-Remaining": "4999",
          "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1_000) + 3_600),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await githubFetch("secret-token", "/user");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer secret-token");
  });
});
