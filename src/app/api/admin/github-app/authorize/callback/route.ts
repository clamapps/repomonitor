import { consumeOAuthState } from "@/lib/auth/oauth-state";
import { requireRouteAdmin } from "@/lib/auth/session";
import { authorizeGitHubAppForPublicPolling } from "@/lib/github/app";
import { redirectWithMessage } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireRouteAdmin();
  const url = new URL(request.url);
  const state = await consumeOAuthState(
    "github-app-user",
    url.searchParams.get("state"),
  );
  if (!state?.codeVerifier) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "GitHub App authorization expired. Please try again.",
    );
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "GitHub did not return an authorization code.",
    );
  }

  try {
    const githubLogin = await authorizeGitHubAppForPublicPolling(
      code,
      state.codeVerifier,
      user.githubId,
      user.id,
    );
    return redirectWithMessage(
      request,
      "/settings",
      "notice",
      `GitHub App authorized as @${githubLogin}. Public repository polling is ready.`,
    );
  } catch (error) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      error instanceof Error
        ? error.message
        : "GitHub App authorization could not be completed.",
    );
  }
}
