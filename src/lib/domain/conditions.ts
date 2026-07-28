export type TextEventMaterial = {
  title: string;
  body?: string | null;
  commitMessages?: string[];
  files?: Array<{
    filename: string;
    previousFilename?: string;
    patch?: string | null;
  }>;
};

export function buildSearchableText(event: TextEventMaterial): string {
  const fileText = (event.files ?? []).flatMap((file) => [
    file.filename,
    file.previousFilename ?? "",
    file.patch ?? "",
  ]);
  return [
    event.title,
    event.body ?? "",
    ...(event.commitMessages ?? []),
    ...fileText,
  ]
    .filter(Boolean)
    .join("\n");
}

export function textContains(
  pattern: string,
  event: TextEventMaterial,
): boolean {
  const needle = pattern.trim().toLocaleLowerCase();
  if (!needle) return false;
  return buildSearchableText(event).toLocaleLowerCase().includes(needle);
}

export function lineChanged(
  previous: string | null,
  current: string | null,
): boolean {
  return previous !== current;
}

export type LineMatchState = "EXACT" | "MOVED" | "REMOVED";
export type LineNotificationTrigger = "removed" | "moved" | "changed";

export function observeCapturedLine(
  capturedContent: string,
  fileContent: string | null,
  lineNumber: number,
): { lineContent: string | null; state: LineMatchState } {
  const lines = fileContent === null ? [] : fileContent.split(/\r?\n/);
  const lineContent = lines[lineNumber - 1] ?? null;

  if (lineContent === capturedContent) {
    return { lineContent, state: "EXACT" };
  }

  const capturedContentExists = lines.some((line) =>
    capturedContent === ""
      ? line === capturedContent
      : line.includes(capturedContent),
  );

  return {
    lineContent,
    state: capturedContentExists ? "MOVED" : "REMOVED",
  };
}

export function lineNotificationTriggers({
  previousLineContent,
  currentLineContent,
  previousState,
  currentState,
  notifyOnRemoved,
  notifyOnMoved,
  notifyOnChanged,
}: {
  previousLineContent: string | null;
  currentLineContent: string | null;
  previousState: LineMatchState;
  currentState: LineMatchState;
  notifyOnRemoved: boolean;
  notifyOnMoved: boolean;
  notifyOnChanged: boolean;
}): LineNotificationTrigger[] {
  const triggers: LineNotificationTrigger[] = [];

  if (
    notifyOnRemoved &&
    currentState === "REMOVED" &&
    previousState !== "REMOVED"
  ) {
    triggers.push("removed");
  }
  if (
    notifyOnMoved &&
    currentState === "MOVED" &&
    previousState !== "MOVED"
  ) {
    triggers.push("moved");
  }
  if (
    notifyOnChanged &&
    lineChanged(previousLineContent, currentLineContent)
  ) {
    triggers.push("changed");
  }

  return triggers;
}

export function describeLine(value: string | null): string {
  return value === null ? "(file or line does not exist)" : value;
}
