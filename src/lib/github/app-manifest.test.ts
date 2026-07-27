import { describe, expect, it } from "vitest";

import { createGitHubAppManifest } from "@/lib/github/app-manifest";

describe("public polling GitHub App manifest", () => {
  it("requests no repository permissions or installation setup", () => {
    const manifest = createGitHubAppManifest("https://monitor.example");

    expect(manifest.default_permissions).toEqual({});
    expect(manifest).not.toHaveProperty("setup_url");
    expect(manifest).not.toHaveProperty("request_oauth_on_install");
  });

  it("registers only the user-authorization callback", () => {
    const manifest = createGitHubAppManifest("https://monitor.example");

    expect(manifest.callback_urls).toEqual([
      "https://monitor.example/api/admin/github-app/authorize/callback",
    ]);
  });
});
