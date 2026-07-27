import { config } from "@/lib/config";
import { createOAuthState } from "@/lib/auth/oauth-state";
import { safeReturnTo } from "@/lib/http";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"), "/");
  const privateAccess = requestUrl.searchParams.get("private") === "true";
  const state = await createOAuthState("github", { returnTo, privateAccess });
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", config().GITHUB_CLIENT_ID);
  authorize.searchParams.set(
    "redirect_uri",
    `${config().APP_URL}/api/auth/github/callback`,
  );
  authorize.searchParams.set(
    "scope",
    privateAccess
      ? "repo read:user user:email"
      : "read:user user:email",
  );
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize);
}
