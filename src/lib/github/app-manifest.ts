export function createGitHubAppManifest(appUrl: string) {
  return {
    name: "RepoMonitor Public Poller",
    url: appUrl,
    description:
      "Authenticated polling of public repositories monitored by RepoMonitor.",
    redirect_url: `${appUrl}/api/admin/github-app/manifest/callback`,
    callback_urls: [
      `${appUrl}/api/admin/github-app/authorize/callback`,
    ],
    public: false,
    hook_attributes: {
      url: `${appUrl}/api/github-app/webhook`,
      active: false,
    },
    default_permissions: {},
    default_events: [],
  };
}
