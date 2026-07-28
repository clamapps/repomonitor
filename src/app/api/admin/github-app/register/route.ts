import { createOAuthState } from "@/lib/auth/oauth-state";
import { requireRouteAdmin } from "@/lib/auth/session";
import { isProduction } from "@/lib/config";
import { githubAppManifest } from "@/lib/github/app";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  await requireRouteAdmin();
  if (!isProduction()) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "GitHub App registration is disabled in development. Public repositories use anonymous REST polling.",
    );
  }
  const state = await createOAuthState("github-app-manifest", {
    returnTo: "/settings",
  });
  const action = `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
  const manifest = escapeAttribute(JSON.stringify(githubAppManifest()));

  return new Response(
    `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Continue to GitHub</title></head>
  <body>
    <form id="github-app-manifest" action="${action}" method="post">
      <input type="hidden" name="manifest" value="${manifest}">
      <button type="submit">Continue to GitHub</button>
    </form>
    <script>document.getElementById("github-app-manifest").submit()</script>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; form-action https://github.com",
      },
    },
  );
}
