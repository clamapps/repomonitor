import { describe, expect, it } from "vitest";

import {
  buildSearchableText,
  evaluateTrackedLine,
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

  it("tracks every relocation, including a move back to the original line", () => {
    const moved = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nreplacement\ntarget",
      changedLineNumber: 2,
      previousChangedLineContent: "target",
      previousMovedLineNumber: 2,
      previousRemovedLineNumber: 2,
      notifyOnRemovedReadded: true,
      notifyOnMoved: true,
      notifyOnChanged: true,
    });
    expect(moved).toMatchObject({
      triggers: ["moved", "changed"],
      changedLineContent: "replacement",
      movedLineNumber: 3,
      removedLineNumber: 3,
    });

    const movedAgain = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nreplacement\nthird\ntarget",
      changedLineNumber: 2,
      previousChangedLineContent: moved.changedLineContent,
      previousMovedLineNumber: moved.movedLineNumber,
      previousRemovedLineNumber: moved.removedLineNumber,
      notifyOnRemovedReadded: true,
      notifyOnMoved: true,
      notifyOnChanged: true,
    });
    expect(movedAgain).toMatchObject({
      triggers: ["moved"],
      changedLineContent: "replacement",
      movedLineNumber: 4,
      removedLineNumber: 4,
    });

    const movedBack = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\ntarget\nreplacement",
      changedLineNumber: 2,
      previousChangedLineContent: movedAgain.changedLineContent,
      previousMovedLineNumber: movedAgain.movedLineNumber,
      previousRemovedLineNumber: movedAgain.removedLineNumber,
      notifyOnRemovedReadded: true,
      notifyOnMoved: true,
      notifyOnChanged: true,
    });
    expect(movedBack).toMatchObject({
      triggers: ["moved", "changed"],
      changedLineContent: "target",
      movedLineNumber: 2,
      removedLineNumber: 2,
    });
  });

  it("keeps changed fixed to the original line while moved follows the capture", () => {
    const evaluation = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "new original value\nother\ntarget",
      changedLineNumber: 1,
      previousChangedLineContent: "target",
      previousMovedLineNumber: 1,
      previousRemovedLineNumber: 1,
      notifyOnRemovedReadded: false,
      notifyOnMoved: true,
      notifyOnChanged: true,
    });

    expect(evaluation.triggers).toEqual(["moved", "changed"]);
    expect(evaluation.changedLineContent).toBe("new original value");
    expect(evaluation.movedLineNumber).toBe(3);
  });

  it("alerts once when removed and again when readded, then tracks removal again", () => {
    const removed = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nother",
      changedLineNumber: 2,
      previousChangedLineContent: "target",
      previousMovedLineNumber: 2,
      previousRemovedLineNumber: 2,
      notifyOnRemovedReadded: true,
      notifyOnMoved: false,
      notifyOnChanged: false,
    });
    expect(removed).toMatchObject({
      triggers: ["removed"],
      movedLineNumber: 2,
      removedLineNumber: null,
    });

    const stillRemoved = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nother",
      changedLineNumber: 2,
      previousChangedLineContent: removed.changedLineContent,
      previousMovedLineNumber: removed.movedLineNumber,
      previousRemovedLineNumber: removed.removedLineNumber,
      notifyOnRemovedReadded: true,
      notifyOnMoved: false,
      notifyOnChanged: false,
    });
    expect(stillRemoved.triggers).toEqual([]);

    const readded = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nother\nthird\ntarget",
      changedLineNumber: 2,
      previousChangedLineContent: stillRemoved.changedLineContent,
      previousMovedLineNumber: stillRemoved.movedLineNumber,
      previousRemovedLineNumber: stillRemoved.removedLineNumber,
      notifyOnRemovedReadded: true,
      notifyOnMoved: false,
      notifyOnChanged: false,
    });
    expect(readded).toMatchObject({
      triggers: ["readded"],
      removedLineNumber: 4,
    });

    const removedAgain = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nother\nthird",
      changedLineNumber: 2,
      previousChangedLineContent: readded.changedLineContent,
      previousMovedLineNumber: readded.movedLineNumber,
      previousRemovedLineNumber: readded.removedLineNumber,
      notifyOnRemovedReadded: true,
      notifyOnMoved: false,
      notifyOnChanged: false,
    });
    expect(removedAgain.triggers).toEqual(["removed"]);
  });

  it("does not report removal while the captured content exists elsewhere", () => {
    const evaluation = evaluateTrackedLine({
      capturedContent: "target",
      fileContent: "first\nother\nprefix target suffix",
      changedLineNumber: 2,
      previousChangedLineContent: "target",
      previousMovedLineNumber: 2,
      previousRemovedLineNumber: 2,
      notifyOnRemovedReadded: true,
      notifyOnMoved: false,
      notifyOnChanged: false,
    });

    expect(evaluation.triggers).toEqual([]);
    expect(evaluation.removedLineNumber).toBe(3);
  });
});
