import { createHash } from "node:crypto";

import { createOAuthState } from "@/lib/auth/oauth-state";
import { requireRouteAdmin } from "@/lib/auth/session";
import { config, isProduction } from "@/lib/config";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { redirectWithMessage } from "@/lib/http";

export async function GET(request: Request) {
  await requireRouteAdmin();
  if (!isProduction()) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "GitHub App authorization is disabled in development. Public repositories use anonymous REST polling.",
    );
  }
  const app = await db.gitHubAppConfiguration.findUnique({
    where: { id: "global" },
  });
  if (!app) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Register the GitHub App before authorizing it.",
    );
  }

  const codeVerifier = randomToken(48);
  const state = await createOAuthState("github-app-user", {
    returnTo: "/settings",
    codeVerifier,
  });
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", app.clientId);
  target.searchParams.set(
    "redirect_uri",
    `${config().APP_URL}/api/admin/github-app/authorize/callback`,
  );
  target.searchParams.set("state", state);
  target.searchParams.set(
    "code_challenge",
    createHash("sha256").update(codeVerifier).digest("base64url"),
  );
  target.searchParams.set("code_challenge_method", "S256");
  target.searchParams.set("prompt", "select_account");
  return Response.redirect(target);
}
