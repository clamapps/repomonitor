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

export function describeLine(value: string | null): string {
  return value === null ? "(file or line does not exist)" : value;
}
