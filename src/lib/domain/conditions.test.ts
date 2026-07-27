import { describe, expect, it } from "vitest";

import {
  buildSearchableText,
  lineChanged,
  textContains,
} from "@/lib/domain/conditions";

describe("text conditions", () => {
  const event = {
    title: "Release v2.0",
    body: "This includes a BREAKING change to retries.",
    commitMessages: ["refactor: new transport"],
    files: [
      {
        filename: "src/network/client.ts",
        patch: "@@ -1 +1 @@\n-timeout = 5\n+timeout = 10",
      },
    ],
  };

  it("matches case-insensitively across release text", () => {
    expect(textContains("breaking CHANGE", event)).toBe(true);
  });

  it("matches repository file paths and patches", () => {
    expect(textContains("network/client.ts", event)).toBe(true);
    expect(textContains("timeout = 10", event)).toBe(true);
  });

  it("rejects empty patterns and unrelated text", () => {
    expect(textContains("  ", event)).toBe(false);
    expect(textContains("database migration", event)).toBe(false);
  });

  it("builds one deterministic searchable document", () => {
    const text = buildSearchableText(event);
    expect(text).toContain("Release v2.0");
    expect(text).toContain("refactor: new transport");
    expect(text).toContain("@@ -1 +1 @@");
  });
});

describe("line conditions", () => {
  it("detects content changes, removal, and creation", () => {
    expect(lineChanged("timeout = 5", "timeout = 10")).toBe(true);
    expect(lineChanged("timeout = 5", null)).toBe(true);
    expect(lineChanged(null, "timeout = 5")).toBe(true);
  });

  it("does not report an unchanged line, including an absent line", () => {
    expect(lineChanged("same", "same")).toBe(false);
    expect(lineChanged(null, null)).toBe(false);
  });
});
