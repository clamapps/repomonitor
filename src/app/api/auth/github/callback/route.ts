import { EmailSource } from "@prisma/client";

import { consumeOAuthState } from "@/lib/auth/oauth-state";
import { createSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  getAuthenticatedEmails,
  getAuthenticatedUser,
} from "@/lib/github/client";
import { safeReturnTo } from "@/lib/http";

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

function authError(message: string): Response {
  const target = new URL("/", config().APP_URL);
  target.searchParams.set("error", message);
  return Response.redirect(target, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = await consumeOAuthState("github", url.searchParams.get("state"));
  if (!state) return authError("GitHub sign-in expired. Please try again.");

  const oauthError = url.searchParams.get("error_description");
  if (oauthError) return authError(oauthError);
  const code = url.searchParams.get("code");
  if (!code) return authError("GitHub did not return an authorization code.");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config().GITHUB_CLIENT_ID,
      client_secret: config().GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${config().APP_URL}/api/auth/github/callback`,
    }),
  });
  const token = (await response.json()) as TokenResponse;
  if (!response.ok || !token.access_token) {
    return authError(
      token.error_description ?? token.error ?? "GitHub sign-in failed.",
    );
  }

  const [profile, emails] = await Promise.all([
    getAuthenticatedUser(token.access_token),
    getAuthenticatedEmails(token.access_token).catch(() => []),
  ]);
  const verifiedEmails = emails.filter((email) => email.verified);
  if (
    profile.email &&
    !verifiedEmails.some((email) => email.email === profile.email)
  ) {
    verifiedEmails.push({
      email: profile.email,
      verified: true,
      primary: verifiedEmails.length === 0,
      visibility: null,
    });
  }

  const user = await db.$transaction(async (tx) => {
    const savedUser = await tx.user.upsert({
      where: { githubId: String(profile.id) },
      update: {
        githubLogin: profile.login,
        displayName: profile.name,
        avatarUrl: profile.avatar_url,
      },
      create: {
        githubId: String(profile.id),
        githubLogin: profile.login,
        displayName: profile.name,
        avatarUrl: profile.avatar_url,
      },
    });

    await tx.gitHubCredential.upsert({
      where: { userId: savedUser.id },
      update: {
        accessTokenEncrypted: encryptSecret(token.access_token!),
        refreshTokenEncrypted: token.refresh_token
          ? encryptSecret(token.refresh_token)
          : null,
        scopes: token.scope ?? "",
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        refreshTokenExpiresAt: token.refresh_token_expires_in
          ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
          : null,
        invalidAt: null,
      },
      create: {
        userId: savedUser.id,
        accessTokenEncrypted: encryptSecret(token.access_token!),
        refreshTokenEncrypted: token.refresh_token
          ? encryptSecret(token.refresh_token)
          : null,
        scopes: token.scope ?? "",
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        refreshTokenExpiresAt: token.refresh_token_expires_in
          ? new Date(Date.now() + token.refresh_token_expires_in * 1000)
          : null,
      },
    });

    let primaryEmailId: string | undefined;
    for (const address of verifiedEmails) {
      const saved = await tx.emailAddress.upsert({
        where: {
          userId_email: { userId: savedUser.id, email: address.email.toLowerCase() },
        },
        update: { source: EmailSource.GITHUB, verifiedAt: new Date() },
        create: {
          userId: savedUser.id,
          email: address.email.toLowerCase(),
          source: EmailSource.GITHUB,
          verifiedAt: new Date(),
        },
      });
      if (address.primary || !primaryEmailId) primaryEmailId = saved.id;
    }

    if (!savedUser.notificationEmailId && primaryEmailId) {
      return tx.user.update({
        where: { id: savedUser.id },
        data: { notificationEmailId: primaryEmailId },
      });
    }
    return savedUser;
  });

  await createSession(user.id);
  return Response.redirect(
    new URL(safeReturnTo(state.returnTo ?? null, "/"), config().APP_URL),
    303,
  );
}
