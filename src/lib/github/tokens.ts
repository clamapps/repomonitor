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

const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * OAuth error codes that mean the refresh token itself is dead. Anything else
 * (5xx, network failure, an unrecognized code) is treated as transient so a
 * blip at GitHub does not permanently disable a working authorization.
 */
const TERMINAL_REFRESH_ERRORS = new Set([
  "bad_refresh_token",
  "bad_verification_code",
  "incorrect_client_credentials",
  "invalid_grant",
  "invalid_client",
  "unauthorized_client",
]);

function refreshFailureIsTerminal(
  status: number,
  error: string | undefined,
): boolean {
  if (error) return TERMINAL_REFRESH_ERRORS.has(error);
  return status === 400 || status === 401 || status === 403;
}

/**
 * GitHub rotates refresh tokens on use, so two concurrent refreshes would make
 * the loser fail with a token the winner already replaced. Refreshes for a
 * credential are collapsed into one in-flight request per process.
 */
const inFlightRefreshes = new Map<string, Promise<string>>();

function refreshCredential(
  credential: GitHubCredential,
  staleAccessToken?: string,
): Promise<string> {
  const pending = inFlightRefreshes.get(credential.id);
  if (pending) return pending;

  const refresh = performRefresh(credential.id, staleAccessToken).finally(() => {
    inFlightRefreshes.delete(credential.id);
  });
  inFlightRefreshes.set(credential.id, refresh);
  return refresh;
}

async function performRefresh(
  credentialId: string,
  staleAccessToken?: string,
): Promise<string> {
  // Re-read rather than trusting the caller's snapshot: another request may
  // have already rotated this credential while we waited.
  const credential = await db.gitHubCredential.findUnique({
    where: { id: credentialId },
  });
  if (!credential || credential.invalidAt) {
    throw new GitHubAuthorizationError();
  }
  const storedAccessToken = decryptSecret(credential.accessTokenEncrypted);
  if (!credential.refreshTokenEncrypted) return storedAccessToken;

  if (staleAccessToken !== undefined) {
    // Someone else refreshed after our token was issued; use theirs.
    if (storedAccessToken !== staleAccessToken) return storedAccessToken;
  } else if (
    credential.expiresAt &&
    credential.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS
  ) {
    return storedAccessToken;
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
  const result = (await response
    .json()
    .catch(() => ({}) as RefreshResponse)) as RefreshResponse;
  if (!response.ok || !result.access_token) {
    const message =
      result.error_description ?? result.error ?? "GitHub token refresh failed";
    if (!refreshFailureIsTerminal(response.status, result.error)) {
      throw new Error(`GitHub token refresh is temporarily failing: ${message}`);
    }
    await db.gitHubCredential.update({
      where: { id: credential.id },
      data: { invalidAt: new Date() },
    });
    throw new GitHubAuthorizationError(message);
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
    credential.expiresAt.getTime() <= Date.now() + REFRESH_SKEW_MS;
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
  const token = await accessTokenForCredential(credential);
  try {
    return await operation(token);
  } catch (error) {
    if (
      error instanceof GitHubApiError &&
      error.status === 401 &&
      credential.refreshTokenEncrypted
    ) {
      const refreshed = await refreshCredential(credential, token);
      if (refreshed !== token) return operation(refreshed);
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
