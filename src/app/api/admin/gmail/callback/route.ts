import { consumeOAuthState } from "@/lib/auth/oauth-state";
import { requireRouteAdmin } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { clearGoogleAccessTokenCache } from "@/lib/email/sender";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function settingsRedirect(
  key: "notice" | "error",
  value: string,
) {
  const target = new URL("/settings", config().APP_URL);
  target.searchParams.set(key, value);
  return Response.redirect(target, 303);
}

export async function GET(request: Request) {
  const admin = await requireRouteAdmin();
  const url = new URL(request.url);
  const state = await consumeOAuthState("google", url.searchParams.get("state"));
  if (!state?.email) {
    return settingsRedirect("error", "Google authorization expired");
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return settingsRedirect(
      "error",
      url.searchParams.get("error_description") ?? "Google authorization failed",
    );
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config().GOOGLE_CLIENT_ID!,
      client_secret: config().GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: `${config().APP_URL}/api/admin/gmail/callback`,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
    return settingsRedirect(
      "error",
      token.error_description ??
        "Google did not return offline access. Please authorize again.",
    );
  }

  const grantedScopes = new Set(token.scope?.split(/\s+/).filter(Boolean));
  if (!grantedScopes.has(GMAIL_SEND_SCOPE)) {
    return settingsRedirect(
      "error",
      "Google did not grant permission to send mail. Please authorize again.",
    );
  }

  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (
    !profileResponse.ok ||
    !profile.sub ||
    !profile.email_verified ||
    profile.email?.toLowerCase() !== state.email.toLowerCase()
  ) {
    return settingsRedirect(
      "error",
      "The authorized Google account did not match the requested sender",
    );
  }

  await db.gmailSender.upsert({
    where: { id: "global" },
    update: {
      email: profile.email,
      googleSubject: profile.sub,
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      configuredByUserId: admin.id,
    },
    create: {
      email: profile.email,
      googleSubject: profile.sub,
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      configuredByUserId: admin.id,
    },
  });
  clearGoogleAccessTokenCache();
  return settingsRedirect(
    "notice",
    `Google sender connected as ${profile.email}`,
  );
}
