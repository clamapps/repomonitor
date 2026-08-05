import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const APP_URL = "https://repomonitor.example.com";

vi.mock("@/lib/config", () => ({
  config: () => ({ APP_URL }),
}));

import {
  assertSameOrigin,
  HttpError,
  routeHandler,
  safeReturnTo,
} from "@/lib/http";

describe("safeReturnTo", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeReturnTo("/settings")).toBe("/settings");
    expect(safeReturnTo("/subscriptions/abc?tab=1")).toBe(
      "/subscriptions/abc?tab=1",
    );
  });

  it("rejects values that resolve off-site", () => {
    for (const value of [
      "//evil.com",
      "/\\evil.com",
      "/\\\\evil.com",
      "https://evil.com",
      "evil.com",
      null,
    ]) {
      expect(safeReturnTo(value)).toBe("/");
    }
  });

  it("never resolves to a foreign origin", () => {
    for (const value of ["//evil.com", "/\\evil.com", "/\\/evil.com"]) {
      const resolved = new URL(safeReturnTo(value), APP_URL);
      expect(resolved.origin).toBe(APP_URL);
    }
  });
});

describe("assertSameOrigin", () => {
  it("accepts a matching origin", () => {
    const request = new Request(`${APP_URL}/api/thing`, {
      method: "POST",
      headers: { Origin: APP_URL },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects a foreign origin", () => {
    const request = new Request(`${APP_URL}/api/thing`, {
      method: "POST",
      headers: { Origin: "https://evil.com" },
    });
    expect(() => assertSameOrigin(request)).toThrow(HttpError);
  });

  it("rejects an opaque origin without throwing a TypeError", () => {
    const request = new Request(`${APP_URL}/api/thing`, {
      method: "POST",
      headers: { Origin: "null" },
    });
    expect(() => assertSameOrigin(request)).toThrow(HttpError);
  });
});

describe("routeHandler", () => {
  it("turns a guard rejection into its status instead of a 500", async () => {
    const handler = routeHandler(async () => {
      throw new HttpError(403, "Invalid request origin");
    });

    const response = await handler(new Request(`${APP_URL}/api/thing`));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Invalid request origin");
  });

  it("redirects when the guard names a destination", async () => {
    const handler = routeHandler(async () => {
      throw new HttpError(401, "Please sign in to continue", "/");
    });

    const response = await handler(new Request(`${APP_URL}/api/thing`));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(location.origin).toBe(APP_URL);
    expect(location.searchParams.get("error")).toBe(
      "Please sign in to continue",
    );
  });

  it("passes other failures through", async () => {
    const handler = routeHandler(async () => {
      throw new Error("boom");
    });

    await expect(handler(new Request(`${APP_URL}/api/thing`))).rejects.toThrow(
      "boom",
    );
  });
});
