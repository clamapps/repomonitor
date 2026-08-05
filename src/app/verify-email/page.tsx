import Link from "next/link";

import { Flash } from "@/app/_components/flash";
import { Header } from "@/app/_components/header";
import { currentUser } from "@/lib/auth/session";
import { pendingVerification } from "@/lib/email/verification";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const token = query.token ?? "";
  const pending = token ? await pendingVerification(token) : null;

  return (
    <>
      <Header user={user} />
      <main className="shell settings-page">
        <Flash error={query.error} />
        <section className="page-title">
          <p className="eyebrow">Account</p>
          <h1>Confirm email address</h1>
        </section>

        <section className="settings-card">
          {!pending ? (
            <p>
              This verification link is invalid or has expired. Request a new
              one from <Link href="/settings">Settings</Link>.
            </p>
          ) : !user ? (
            <>
              <p>
                Sign in to confirm <strong>{pending.email}</strong> for
                RepoMonitor notifications.
              </p>
              <Link
                className="button button-primary"
                href={`/api/auth/github?returnTo=${encodeURIComponent(`/verify-email?token=${token}`)}`}
              >
                Sign in with GitHub
              </Link>
            </>
          ) : user.id !== pending.userId ? (
            <p>
              This link was requested by a different RepoMonitor account. Sign
              in as that account to confirm the address. No notifications are
              sent to an address until it is confirmed.
            </p>
          ) : (
            <>
              <p>
                Confirm <strong>{pending.email}</strong> so it can be selected
                for RepoMonitor notifications.
              </p>
              <form action="/api/email/verify" method="post">
                <input type="hidden" name="token" value={token} />
                <button className="button button-primary" type="submit">
                  Confirm this address
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </>
  );
}
