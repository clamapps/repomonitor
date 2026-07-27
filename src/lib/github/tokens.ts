import "server-only";

import { GitHubCredential } from "@prisma/client";

import { config } from "@/lib/config";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  GitHubApiError,
  hasPrivateRepositoryAccess,
} from "@/lib/github/access";

type RefreshResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export class GitHubAuthorizationError extends Error {
  readonly code = "AUTHORIZATION_UNAVAILABLE";

  constructor(message = "GitHub authorization is unavailable") {
    super(message);
    this.name = "GitHubAuthorizationError";
  }
}

async function refreshCredential(credential: GitHubCredential): Promise<string> {
  if (!credential.refreshTokenEncrypted) {
    return decryptSecret(credential.accessTokenEncrypted);
  }

  const body = new URLSearchParams({
    client_id: config().GITHUB_CLIENT_ID,
    client_secret: config().GITHUB_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: decryptSecret(credential.refreshTokenEncrypted),
  });
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const result = (await response.json()) as RefreshResponse;
  if (!response.ok || !result.access_token) {
    await db.gitHubCredential.update({
      where: { id: credential.id },
      data: { invalidAt: new Date() },
    });
    throw new GitHubAuthorizationError(
      result.error_description ?? result.error ?? "GitHub token refresh failed",
    );
  }

  await db.gitHubCredential.update({
    where: { id: credential.id },
    data: {
      accessTokenEncrypted: encryptSecret(result.access_token),
      refreshTokenEncrypted: result.refresh_token
        ? encryptSecret(result.refresh_token)
        : credential.refreshTokenEncrypted,
      expiresAt: result.expires_in
        ? new Date(Date.now() + result.expires_in * 1000)
        : null,
      refreshTokenExpiresAt: result.refresh_token_expires_in
        ? new Date(Date.now() + result.refresh_token_expires_in * 1000)
        : credential.refreshTokenExpiresAt,
      scopes: result.scope ?? credential.scopes,
      invalidAt: null,
    },
  });
  return result.access_token;
}

export async function accessTokenForCredential(
  credential: GitHubCredential,
): Promise<string> {
  const expiresSoon =
    credential.expiresAt &&
    credential.expiresAt.getTime() <= Date.now() + 5 * 60 * 1000;
  if (expiresSoon) return refreshCredential(credential);
  return decryptSecret(credential.accessTokenEncrypted);
}

export async function withUserGitHubToken<T>(
  userId: string,
  operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  const credential = await db.gitHubCredential.findUnique({ where: { userId } });
  if (!credential || credential.invalidAt) {
    throw new GitHubAuthorizationError();
  }
  return withCredentialToken(credential, operation);
}

async function withCredentialToken<T>(
  credential: GitHubCredential,
  operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  let token = await accessTokenForCredential(credential);
  try {
    return await operation(token);
  } catch (error) {
    if (
      error instanceof GitHubApiError &&
      error.status === 401 &&
      credential.refreshTokenEncrypted
    ) {
      token = await refreshCredential(credential);
      return operation(token);
    }
    throw error;
  }
}

export async function withPrivateRepositoryToken<T>(
  userId: string,
  operation: (accessToken: string) => Promise<T>,
): Promise<T> {
  const credential = await db.gitHubCredential.findUnique({ where: { userId } });
  if (
    !credential ||
    credential.invalidAt ||
    !hasPrivateRepositoryAccess(credential.scopes)
  ) {
    throw new GitHubAuthorizationError(
      "Private repository access is not authorized for this GitHub account.",
    );
  }
  return withCredentialToken(credential, operation);
}
