import Link from "next/link";

import { Brand } from "@/app/_components/brand";
import { userIsAdmin } from "@/lib/auth/session";

type HeaderUser = {
  githubLogin: string;
  displayName: string | null;
};

export function Header({ user }: { user: HeaderUser | null }) {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav className="nav" aria-label="Primary navigation">
          {user ? (
            <>
              <Link href="/">Subscriptions</Link>
              <Link href="/settings">
                Settings
                {userIsAdmin(user.githubLogin) ? (
                  <span className="admin-dot" title="Super-admin" />
                ) : null}
              </Link>
              <form action="/api/auth/logout" method="post">
                <button className="link-button" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link className="button button-primary button-small" href="/sign-in">
              Sign in with GitHub
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
