import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/app/_components/brand";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await currentUser()) redirect("/");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Brand />
        <p className="eyebrow">GitHub authorization</p>
        <h1>Choose repository access</h1>
        <p>
          Both options sign you in and read your GitHub profile and email
          addresses. Private repository access is optional.
        </p>
        <div className="auth-options">
          <a
            className="auth-option"
            href="/api/auth/github?private=false"
          >
            <strong>Public repositories only</strong>
            <span>
              Do not grant RepoMonitor access to private repository contents.
            </span>
          </a>
          <a
            className="auth-option auth-option-primary"
            href="/api/auth/github?private=true"
          >
            <strong>Include private repositories</strong>
            <span>
              Request GitHub&apos;s repo scope so your private subscriptions can
              be polled with your token.
            </span>
          </a>
        </div>
        <Link href="/">Cancel</Link>
      </section>
    </main>
  );
}
