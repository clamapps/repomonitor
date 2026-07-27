import Link from "next/link";

import { EventBadge } from "@/app/_components/event-badge";
import { Flash } from "@/app/_components/flash";
import { Header } from "@/app/_components/header";
import { currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasPrivateRepositoryAccess } from "@/lib/github/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ notice?: string; error?: string }>;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [user, params] = await Promise.all([currentUser(), searchParams]);
  const subscriptions = user
    ? await db.subscription.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          repository: true,
          events: {
            where: { enabled: true },
            include: { _count: { select: { conditions: true } } },
            orderBy: { type: "asc" },
          },
        },
      })
    : [];
  const privateRepositoryAccess = Boolean(
    user?.githubCredential &&
      !user.githubCredential.invalidAt &&
      hasPrivateRepositoryAccess(user.githubCredential.scopes),
  );

  return (
    <>
      <Header user={user} />
      <main className="shell dashboard">
        <Flash notice={params.notice} error={params.error} />
        <section className="dashboard-heading">
          <div>
            <p className="eyebrow">Your watchlist</p>
            <h1>Subscriptions</h1>
            <p>
              {subscriptions.length
                ? `${subscriptions.length} ${subscriptions.length === 1 ? "repository" : "repositories"} under watch.`
                : "No repositories under watch."}
            </p>
          </div>
          {user ? (
            <a className="button button-primary" href="#add-repository">
              <span aria-hidden="true">+</span> Add repository
            </a>
          ) : null}
        </section>

        {subscriptions.length ? (
          <section className="subscription-grid" aria-label="Subscriptions">
            {subscriptions.map((subscription) => (
              <Link
                className={`repo-card ${subscription.errorAt ? "repo-card-error" : ""}`}
                href={`/subscriptions/${subscription.id}`}
                key={subscription.id}
              >
                <div className="repo-card-top">
                  <span className="repo-monogram" aria-hidden="true">
                    {subscription.repository.owner.slice(0, 1).toUpperCase()}
                  </span>
                  <span
                    className={`status-line ${subscription.errorAt ? "status-line-error" : ""}`}
                  >
                    <i />
                    {subscription.errorAt ? "Action needed" : "Monitoring"}
                  </span>
                </div>
                <h2>{subscription.repository.fullName}</h2>
                <p className="repo-meta">
                  {subscription.repository.isPrivate ? "Private" : "Public"} ·{" "}
                  {subscription.repository.defaultBranch}
                </p>
                <div className="badge-row">
                  {subscription.events.map((event) => (
                    <EventBadge key={event.id} type={event.type} />
                  ))}
                </div>
                <div className="repo-card-footer">
                  <span>
                    {subscription.errorAt
                      ? subscription.errorMessage
                      : `${subscription.events.reduce(
                          (count, event) => count + event._count.conditions,
                          0,
                        )} conditions`}
                  </span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <section className="empty-state">
            <span className="empty-symbol" aria-hidden="true">
              ◎
            </span>
            <h2>No repositories yet</h2>
            <p>
              {user
                ? "Add a repository below. Monitoring starts from the current version."
                : "Sign in with GitHub to add a repository subscription."}
            </p>
          </section>
        )}

        {user ? (
          <section className="panel add-panel" id="add-repository">
            <div className="panel-copy">
              <p className="eyebrow">New subscription</p>
              <h2>Add a repository</h2>
              <p>
                {privateRepositoryAccess
                  ? "Public or private is available. Private repositories use only your GitHub token."
                  : "Public repositories are available. Enable private repository access in Settings to add private repositories."}
              </p>
            </div>
            <form className="add-form" action="/api/subscriptions" method="post">
              <label>
                GitHub repository
                <input
                  name="repository"
                  placeholder="owner/repository"
                  required
                  autoComplete="off"
                />
                <small>Paste owner/repo or the full GitHub URL.</small>
              </label>
              <fieldset className="event-choices">
                <legend>Watch for</legend>
                <label className="check-card">
                  <input name="commits" type="checkbox" defaultChecked />
                  <span>
                    <b>↗</b>
                    <strong>Commits</strong>
                    <small>Default branch changes</small>
                  </span>
                </label>
                <label className="check-card">
                  <input name="releases" type="checkbox" defaultChecked />
                  <span>
                    <b>◆</b>
                    <strong>Releases</strong>
                    <small>Published tags</small>
                  </span>
                </label>
              </fieldset>
              <button className="button button-primary" type="submit">
                Add and configure
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
