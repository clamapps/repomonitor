import { consumeOAuthState } from "@/lib/auth/oauth-state";
import { requireRouteAdmin } from "@/lib/auth/session";
import { registerGitHubAppFromManifest } from "@/lib/github/app";
import { redirectWithMessage } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireRouteAdmin();
  const url = new URL(request.url);
  const state = await consumeOAuthState(
    "github-app-manifest",
    url.searchParams.get("state"),
  );
  if (!state) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "GitHub App registration expired. Please try again.",
    );
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "GitHub did not return an app registration code.",
    );
  }

  try {
    await registerGitHubAppFromManifest(code, user.id);
    return redirectWithMessage(
      request,
      "/settings",
      "notice",
      "GitHub App registered. Authorize it to enable authenticated public polling.",
    );
  } catch (error) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      error instanceof Error
        ? error.message
        : "GitHub App registration could not be completed.",
    );
  }
}
