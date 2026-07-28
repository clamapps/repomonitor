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
export type LineNotificationTrigger =
  | "removed"
  | "readded"
  | "moved"
  | "changed";

type CapturedLineLocation = {
  lineNumber: number;
  exact: boolean;
};

function capturedLineLocations(
  capturedContent: string,
  lines: string[],
): CapturedLineLocation[] {
  const locations: CapturedLineLocation[] = [];
  for (const [index, line] of lines.entries()) {
    const matches =
      capturedContent === ""
        ? line === capturedContent
        : line.includes(capturedContent);
    if (matches) {
      locations.push({
        lineNumber: index + 1,
        exact: line === capturedContent,
      });
    }
  }
  return locations;
}

function nearestLineNumber(
  locations: CapturedLineLocation[],
  preferredLineNumber: number,
): number | null {
  if (locations.length === 0) return null;

  const exactLocations = locations.filter((location) => location.exact);
  const candidates = exactLocations.length > 0 ? exactLocations : locations;
  if (
    candidates.some(
      (location) => location.lineNumber === preferredLineNumber,
    )
  ) {
    return preferredLineNumber;
  }

  return [...candidates].sort(
    (left, right) =>
      Math.abs(left.lineNumber - preferredLineNumber) -
        Math.abs(right.lineNumber - preferredLineNumber) ||
      left.lineNumber - right.lineNumber,
  )[0].lineNumber;
}

export type TrackedLineEvaluation = {
  triggers: LineNotificationTrigger[];
  changedLineContent: string | null;
  movedLineNumber: number;
  removedLineNumber: number | null;
  state: LineMatchState;
};

export function evaluateTrackedLine({
  capturedContent,
  fileContent,
  changedLineNumber,
  previousChangedLineContent,
  previousMovedLineNumber,
  previousRemovedLineNumber,
  notifyOnRemovedReadded,
  notifyOnMoved,
  notifyOnChanged,
}: {
  capturedContent: string;
  fileContent: string | null;
  changedLineNumber: number;
  previousChangedLineContent: string | null;
  previousMovedLineNumber: number;
  previousRemovedLineNumber: number | null;
  notifyOnRemovedReadded: boolean;
  notifyOnMoved: boolean;
  notifyOnChanged: boolean;
}): TrackedLineEvaluation {
  const lines = fileContent === null ? [] : fileContent.split(/\r?\n/);
  const changedLineContent = lines[changedLineNumber - 1] ?? null;
  const locations = capturedLineLocations(capturedContent, lines);
  const currentMovedLineNumber = nearestLineNumber(
    locations,
    previousMovedLineNumber,
  );
  const currentRemovedLineNumber =
    locations.length === 0
      ? null
      : nearestLineNumber(
          locations,
          previousRemovedLineNumber ??
            currentMovedLineNumber ??
            changedLineNumber,
        );
  const triggers: LineNotificationTrigger[] = [];

  if (
    notifyOnRemovedReadded &&
    previousRemovedLineNumber !== null &&
    currentRemovedLineNumber === null
  ) {
    triggers.push("removed");
  }
  if (
    notifyOnRemovedReadded &&
    previousRemovedLineNumber === null &&
    currentRemovedLineNumber !== null
  ) {
    triggers.push("readded");
  }
  if (
    notifyOnMoved &&
    currentMovedLineNumber !== null &&
    currentMovedLineNumber !== previousMovedLineNumber
  ) {
    triggers.push("moved");
  }
  if (
    notifyOnChanged &&
    lineChanged(previousChangedLineContent, changedLineContent)
  ) {
    triggers.push("changed");
  }

  return {
    triggers,
    changedLineContent,
    movedLineNumber: currentMovedLineNumber ?? previousMovedLineNumber,
    removedLineNumber: currentRemovedLineNumber,
    state:
      currentRemovedLineNumber === null
        ? "REMOVED"
        : lines[changedLineNumber - 1] === capturedContent
          ? "EXACT"
          : "MOVED",
  };
}
