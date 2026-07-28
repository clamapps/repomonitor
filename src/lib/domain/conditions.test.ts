import { describe, expect, it } from "vitest";

import {
  buildSearchableText,
  lineChanged,
  lineNotificationTriggers,
  observeCapturedLine,
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

  it("distinguishes exact, moved, substring, and removed content", () => {
    expect(observeCapturedLine("target", "first\ntarget\nlast", 2)).toEqual({
      lineContent: "target",
      state: "EXACT",
    });
    expect(observeCapturedLine("target", "target\nother", 2)).toEqual({
      lineContent: "other",
      state: "MOVED",
    });
    expect(observeCapturedLine("target", "first\nprefix target suffix", 2)).toEqual(
      {
        lineContent: "prefix target suffix",
        state: "MOVED",
      },
    );
    expect(observeCapturedLine("target", "first\nother", 2)).toEqual({
      lineContent: "other",
      state: "REMOVED",
    });
    expect(observeCapturedLine("target", null, 2)).toEqual({
      lineContent: null,
      state: "REMOVED",
    });
  });

  it("does not fire a removed-only condition while content exists elsewhere", () => {
    expect(
      lineNotificationTriggers({
        previousLineContent: "target",
        currentLineContent: "other",
        previousState: "EXACT",
        currentState: "MOVED",
        notifyOnRemoved: true,
        notifyOnMoved: false,
        notifyOnChanged: false,
      }),
    ).toEqual([]);
  });

  it("fires each selected transition without repeating a persistent state", () => {
    expect(
      lineNotificationTriggers({
        previousLineContent: "target",
        currentLineContent: "other",
        previousState: "EXACT",
        currentState: "MOVED",
        notifyOnRemoved: true,
        notifyOnMoved: true,
        notifyOnChanged: true,
      }),
    ).toEqual(["moved", "changed"]);

    expect(
      lineNotificationTriggers({
        previousLineContent: "other",
        currentLineContent: "other",
        previousState: "MOVED",
        currentState: "MOVED",
        notifyOnRemoved: true,
        notifyOnMoved: true,
        notifyOnChanged: true,
      }),
    ).toEqual([]);

    expect(
      lineNotificationTriggers({
        previousLineContent: "other",
        currentLineContent: "other",
        previousState: "MOVED",
        currentState: "REMOVED",
        notifyOnRemoved: true,
        notifyOnMoved: true,
        notifyOnChanged: true,
      }),
    ).toEqual(["removed"]);
  });
});
