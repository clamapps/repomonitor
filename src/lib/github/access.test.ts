import { describe, expect, it } from "vitest";

import {
  GitHubApiError,
  hasPrivateRepositoryAccess,
  permanentGitHubAccessFailure,
} from "@/lib/github/access";

describe("GitHub OAuth scopes", () => {
  it("recognizes repo scope in GitHub's comma-separated response", () => {
    expect(hasPrivateRepositoryAccess("repo,read:user,user:email")).toBe(true);
  });

  it("does not treat profile scopes as private repository access", () => {
    expect(hasPrivateRepositoryAccess("read:user user:email")).toBe(false);
  });
});

describe("permanent GitHub access failures", () => {
  it.each([401, 404, 410])("classifies status %s as permanent", (status) => {
    const failure = permanentGitHubAccessFailure(
      new GitHubApiError("failed", status, "{}"),
    );
    expect(failure).not.toBeNull();
  });

  it("classifies a normal permission denial as permanent", () => {
    const failure = permanentGitHubAccessFailure(
      new GitHubApiError(
        "failed",
        403,
        '{"message":"Resource not accessible by integration"}',
      ),
    );
    expect(failure?.code).toBe("ACCESS_DENIED");
  });

  it("keeps primary and secondary rate limits transient", () => {
    expect(
      permanentGitHubAccessFailure(
        new GitHubApiError("failed", 403, "API rate limit exceeded", null, "0"),
      ),
    ).toBeNull();
    expect(
      permanentGitHubAccessFailure(
        new GitHubApiError("failed", 403, "secondary rate limit", "60", null),
      ),
    ).toBeNull();
  });

  it("keeps server errors transient", () => {
    expect(
      permanentGitHubAccessFailure(
        new GitHubApiError("failed", 503, "temporarily unavailable"),
      ),
    ).toBeNull();
  });
});
