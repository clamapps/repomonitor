import "server-only";

import { createHash } from "node:crypto";

import {
  GitHubApiError,
  permanentGitHubAccessFailure,
} from "@/lib/github/access";
import {
  GITHUB_DEFAULT_HOURLY_LIMIT,
  GitHubRateLimitTracker,
  type GitHubRequestMode,
} from "@/lib/github/rate-limit";

const API_ROOT = "https://api.github.com";

export { GitHubApiError, permanentGitHubAccessFailure };

type GitHubRequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

const rateLimits = new GitHubRateLimitTracker();

function requestIdentity(accessToken: string): {
  key: string;
  mode: GitHubRequestMode;
} {
  if (!accessToken) return { key: "anonymous", mode: "anonymous" };
  const fingerprint = createHash("sha256")
    .update(accessToken)
    .digest("base64url");
  return { key: `token:${fingerprint}`, mode: "authenticated" };
}

export async function githubFetch<T>(
  accessToken: string,
  path: string,
  options: GitHubRequestOptions = {},
): Promise<T> {
  const identity = requestIdentity(accessToken);
  const blocked = rateLimits.reserve(identity.key, identity.mode);
  if (blocked) {
    throw new GitHubApiError(
      `GitHub ${identity.mode} REST API limit is exhausted; retry after ${blocked.retryAfterSeconds} seconds`,
      429,
      JSON.stringify({
        message: `${identity.mode} GitHub REST API request budget exhausted`,
        limit: GITHUB_DEFAULT_HOURLY_LIMIT[identity.mode],
      }),
      String(blocked.retryAfterSeconds),
      String(blocked.remaining),
    );
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "RepoMonitor",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  const errorBody = response.ok ? "" : await response.text();
  rateLimits.recordResponse(
    identity.key,
    identity.mode,
    {
      limit: response.headers.get("x-ratelimit-limit"),
      remaining: response.headers.get("x-ratelimit-remaining"),
      reset: response.headers.get("x-ratelimit-reset"),
      retryAfter: response.headers.get("retry-after"),
    },
    response.status,
    errorBody,
  );

  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub request failed with ${response.status}`,
      response.status,
      errorBody,
      response.headers.get("retry-after"),
      response.headers.get("x-ratelimit-remaining"),
    );
  }
  return (await response.json()) as T;
}

export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
};

export type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
};

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  owner: { login: string };
};

export type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
};

export type GitHubCommitDetail = GitHubCommit & {
  files?: Array<{
    filename: string;
    previous_filename?: string;
    status: string;
    patch?: string;
  }>;
};

export type GitHubRelease = {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

type GitHubContents = {
  type: "file";
  encoding: "base64" | string;
  content: string;
};

export async function getAuthenticatedUser(accessToken: string) {
  return githubFetch<GitHubUser>(accessToken, "/user");
}

export async function getAuthenticatedEmails(accessToken: string) {
  return githubFetch<GitHubEmail[]>(accessToken, "/user/emails");
}

export async function getRepository(
  accessToken: string,
  owner: string,
  name: string,
) {
  return githubFetch<GitHubRepository>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  );
}

export async function getCommit(
  accessToken: string,
  owner: string,
  name: string,
  ref: string,
) {
  return githubFetch<GitHubCommitDetail>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(ref)}`,
  );
}

export async function listCommitsSince(
  accessToken: string,
  owner: string,
  name: string,
  branch: string,
  since: Date,
  maxPages = 10,
): Promise<GitHubCommit[]> {
  const commits: GitHubCommit[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const query = new URLSearchParams({
      sha: branch,
      since: new Date(since.getTime() - 60_000).toISOString(),
      per_page: "100",
      page: String(page),
    });
    const batch = await githubFetch<GitHubCommit[]>(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?${query}`,
    );
    commits.push(...batch);
    if (batch.length < 100) break;
  }
  return commits.reverse();
}

export async function listReleasesAfter(
  accessToken: string,
  owner: string,
  name: string,
  cursor: string,
  maxPages = 10,
): Promise<GitHubRelease[]> {
  const releases: GitHubRelease[] = [];
  let reachedCursor = false;

  for (let page = 1; page <= maxPages && !reachedCursor; page += 1) {
    const batch = await githubFetch<GitHubRelease[]>(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?per_page=100&page=${page}`,
    );
    for (const release of batch) {
      if (String(release.id) === cursor) {
        reachedCursor = true;
        break;
      }
      if (!release.draft) releases.push(release);
    }
    if (batch.length < 100) break;
  }
  return releases.reverse();
}

export async function getLatestRelease(
  accessToken: string,
  owner: string,
  name: string,
): Promise<GitHubRelease | null> {
  const releases = await githubFetch<GitHubRelease[]>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?per_page=10`,
  );
  return releases.find((release) => !release.draft) ?? null;
}

export type GitHubComparison = {
  commits: GitHubCommit[];
  files?: GitHubCommitDetail["files"];
};

export async function compareCommits(
  accessToken: string,
  owner: string,
  name: string,
  base: string,
  head: string,
) {
  return githubFetch<GitHubComparison>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  );
}

export async function getFileContent(
  accessToken: string,
  owner: string,
  name: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  try {
    const query = new URLSearchParams({ ref });
    const file = await githubFetch<GitHubContents>(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodedPath}?${query}`,
    );
    if (file.type !== "file" || file.encoding !== "base64") return null;
    return Buffer.from(file.content.replace(/\n/g, ""), "base64").toString(
      "utf8",
    );
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getFileLine(
  accessToken: string,
  owner: string,
  name: string,
  path: string,
  lineNumber: number,
  ref: string,
): Promise<string | null> {
  const content = await getFileContent(accessToken, owner, name, path, ref);
  return content?.split(/\r?\n/)[lineNumber - 1] ?? null;
}
