import "server-only";

import { cookies } from "next/headers";

import { isProduction } from "@/lib/config";
import { randomToken, signState, verifyState } from "@/lib/crypto";

const MAX_AGE_SECONDS = 10 * 60;

type OAuthState = {
  nonce: string;
  issuedAt: number;
  provider:
    | "github"
    | "google"
    | "github-app-manifest"
    | "github-app-user";
  returnTo?: string;
  email?: string;
  privateAccess?: boolean;
  codeVerifier?: string;
};

export async function createOAuthState(
  provider: OAuthState["provider"],
  extra: Omit<OAuthState, "nonce" | "issuedAt" | "provider"> = {},
): Promise<string> {
  const state = signState({
    nonce: randomToken(18),
    issuedAt: Date.now(),
    provider,
    ...extra,
  });
  const jar = await cookies();
  jar.set(`repomonitor_${provider}_oauth`, state, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return state;
}

export async function consumeOAuthState(
  provider: OAuthState["provider"],
  received: string | null,
): Promise<OAuthState | null> {
  const jar = await cookies();
  const cookieName = `repomonitor_${provider}_oauth`;
  const stored = jar.get(cookieName)?.value;
  jar.delete(cookieName);
  if (!received || !stored || received !== stored) return null;

  const state = verifyState<OAuthState>(received);
  if (
    !state ||
    state.provider !== provider ||
    Date.now() - state.issuedAt > MAX_AGE_SECONDS * 1000
  ) {
    return null;
  }
  return state;
}
