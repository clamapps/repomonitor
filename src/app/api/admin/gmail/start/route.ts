import { z } from "zod";

import { createOAuthState } from "@/lib/auth/oauth-state";
import { requireRouteAdmin } from "@/lib/auth/session";
import { config, googleOAuthConfigured } from "@/lib/config";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await requireRouteAdmin();
  if (!googleOAuthConfigured()) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first",
    );
  }
  const form = await request.formData();
  const parsed = z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .safeParse(form.get("email"));
  if (!parsed.success) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Enter a valid Google account email",
    );
  }

  const state = await createOAuthState("google", { email: parsed.data });
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", config().GOOGLE_CLIENT_ID!);
  authorize.searchParams.set(
    "redirect_uri",
    `${config().APP_URL}/api/admin/gmail/callback`,
  );
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set(
    "scope",
    "openid email https://www.googleapis.com/auth/gmail.send",
  );
  authorize.searchParams.set("include_granted_scopes", "true");
  authorize.searchParams.set("access_type", "offline");
  authorize.searchParams.set("prompt", "consent");
  authorize.searchParams.set("login_hint", parsed.data);
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize, 303);
}
