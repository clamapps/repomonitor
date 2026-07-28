import { describe, expect, it } from "vitest";

import { parseGitHubPermalink } from "@/lib/domain/github-permalink";

describe("GitHub permalink parsing", () => {
  const permalink =
    "https://github.com/clamapps/repomonitor/blob/d689bc380f45889d933699215abb1fa68f7ba3b5/README.md?plain=1#L142";

  it("extracts the repository, file path, and line number", () => {
    expect(parseGitHubPermalink(permalink)).toEqual({
      owner: "clamapps",
      repository: "repomonitor",
      ref: "d689bc380f45889d933699215abb1fa68f7ba3b5",
      filePath: "README.md",
      lineNumber: 142,
    });
  });

  it("accepts a Markdown-wrapped URL and encoded nested paths", () => {
    expect(
      parseGitHubPermalink(
        "[config](https://github.com/clamapps/repomonitor/blob/main/src/my%20config.ts#L12-L15)",
      ),
    ).toMatchObject({
      filePath: "src/my config.ts",
      lineNumber: 12,
    });
  });

  it("rejects non-GitHub URLs and links without a line anchor", () => {
    expect(
      parseGitHubPermalink("https://example.com/owner/repo/blob/main/file.ts#L2"),
    ).toBeNull();
    expect(
      parseGitHubPermalink(
        "https://github.com/clamapps/repomonitor/blob/main/README.md",
      ),
    ).toBeNull();
  });
});
