export type GitHubPermalink = {
  owner: string;
  repository: string;
  ref: string;
  filePath: string;
  lineNumber: number;
};

function unwrapMarkdownLink(value: string): string {
  const match = value
    .trim()
    .match(/^\[[^\]]*]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)$/i);
  return match?.[1] ?? value.trim();
}

export function parseGitHubPermalink(
  value: string,
): GitHubPermalink | null {
  const input = unwrapMarkdownLink(value);
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["github.com", "www.github.com"].includes(url.hostname.toLowerCase())
  ) {
    return null;
  }

  const lineMatch = url.hash.match(/^#L([1-9]\d*)(?:-L[1-9]\d*)?$/i);
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    !lineMatch ||
    segments.length < 5 ||
    segments[2]?.toLowerCase() !== "blob"
  ) {
    return null;
  }

  try {
    const [owner, repository, , ref, ...encodedPath] = segments;
    const filePath = encodedPath.map(decodeURIComponent).join("/");
    if (!owner || !repository || !ref || !filePath) return null;

    return {
      owner: decodeURIComponent(owner),
      repository: decodeURIComponent(repository),
      ref: decodeURIComponent(ref),
      filePath,
      lineNumber: Number(lineMatch[1]),
    };
  } catch {
    return null;
  }
}
