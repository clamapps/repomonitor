import "server-only";

import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isProduction, isSuperAdminLogin } from "@/lib/config";
import { hashToken, randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";

const SESSION_COOKIE = "repomonitor_session";
const SESSION_DAYS = 30;

const userInclude = Prisma.validator<Prisma.UserInclude>()({
  notificationEmail: true,
  githubCredential: true,
  emailAddresses: {
    orderBy: [{ verifiedAt: "desc" }, { createdAt: "asc" }],
  },
});

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: userInclude } },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } });
    jar.delete(SESSION_COOKIE);
    return null;
  }
  return session.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/?error=Please sign in to continue");
  return user;
}

export async function requireRouteUser() {
  const user = await currentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isSuperAdminLogin(user.githubLogin)) redirect("/");
  return user;
}

export async function requireRouteAdmin() {
  const user = await requireRouteUser();
  if (!isSuperAdminLogin(user.githubLogin)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export function userIsAdmin(githubLogin: string): boolean {
  return isSuperAdminLogin(githubLogin);
}
