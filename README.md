# RepoMonitor

RepoMonitor is a small, self-hosted web application that watches GitHub
repositories for precise changes and emails subscribed users when a condition
matches.

## What is implemented

- GitHub OAuth sign-in with optional private-repository authorization
- A super-admin-managed, read-only GitHub App for shared public polling
- Public and private repository subscriptions
- Commit and release event streams
- Case-insensitive text matching across:
  - commit messages and changed file patches
  - release names, notes, intervening commit messages, and changed file patches
- File/line monitoring with an exact captured baseline
- Shared public polling: one GitHub App request stream per repository/event
- Isolated private polling: every subscriber uses only their own OAuth token
- Durable access-error states with user-visible recovery and email alerts
- Daily scheduled polls with a database lease, plus a super-admin “Poll now”
  action
- Deduplicated notifications, crash recovery, retry handling, and configurable
  random delays between sends
- GitHub notification addresses and custom addresses with email verification
- Local `sendmail` delivery by default
- Super-admin Google OAuth setup for a global Gmail API sender
- Responsive account, subscription, condition, and admin screens
- SQLite persistence, Prisma migrations, a multi-stage Docker image, and
  Docker Compose

## How line monitoring works

When a line condition is created, RepoMonitor resolves the current event
reference:

- commits use the default branch head
- releases use the latest published release tag, falling back to the default
  branch when no release exists

It stores the resolved commit SHA and the exact content of the selected
one-based line. Each new commit or release resolves to a commit SHA and fetches
that line again. A changed value, deleted line/file, or newly created line is a
match. The latest observed value is then saved so later notifications describe
the change from the preceding observation. The original baseline remains stored
for audit context.

For releases, RepoMonitor resolves the release tag to its commit and compares
that commit with the preceding release commit. This makes both line and text
conditions operate against the code that was actually released.

## Local setup

Requirements:

- Node.js 22+
- pnpm 10+
- a GitHub OAuth App
- a working local `sendmail` command, unless Gmail is connected

Install and configure:

```sh
pnpm install
cp .env.example .env
pnpm db:deploy
pnpm dev
```

Register these callback URLs in the provider consoles:

- GitHub: `http://localhost:3000/api/auth/github/callback`
- Google: `http://localhost:3000/api/admin/gmail/callback`

The public-polling GitHub App is registered from the super-admin Settings page.
Its manifest automatically supplies the registration and user-authorization
callback URLs based on `APP_URL`.

Generate real secrets before starting:

```sh
openssl rand -hex 32
openssl rand -base64 32
```

Use those values for `SESSION_SECRET` and `ENCRYPTION_KEY` respectively.
Changing `ENCRYPTION_KEY` after provider tokens have been stored makes those
tokens unreadable.

### GitHub OAuth

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for a normal GitHub OAuth App.
At sign-in, users choose one of two grants:

- public only: `read:user` and `user:email`
- public and private: `repo`, `read:user`, and `user:email`

The stored token is replaced each time the user changes this choice. The broad
classic `repo` scope is only requested when the user explicitly enables private
repository monitoring.

Set `SUPER_ADMIN_GITHUB_LOGINS` to a comma-separated list of GitHub logins:

```dotenv
SUPER_ADMIN_GITHUB_LOGINS=octocat,hubot
```

Matching is case-insensitive. Only these users see the GitHub App setup, Gmail
sender, and manual poll controls.

### Public polling GitHub App

After signing in as a super-admin, open Settings:

1. Select **Register GitHub App**. RepoMonitor uses GitHub's manifest flow to
   create an app with no repository permissions and no active webhooks.
2. Select **Authorize GitHub App** and authorize it with the same GitHub account
   used for the RepoMonitor super-admin session.

RepoMonitor stores the resulting GitHub App user access and refresh tokens
encrypted. GitHub Apps acting on behalf of a user have implicit read access to
public resources, so the app does not need to be installed on or granted access
to any repositories. The token is used only to make public REST API requests
with an authenticated rate limit instead of GitHub's anonymous limit.

### Email

By default, notifications are piped to `SENDMAIL_PATH` using `-t -i`.
`MAIL_FROM` controls the sender header.

To enable the optional global Gmail sender:

1. Create a Google OAuth web application.
2. Enable the Gmail API.
3. Add the Google callback URL shown above.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Sign in as a super-admin, open Settings, and connect the sender address.

The app requests offline access plus the minimal `gmail.send` scope and stores
the refresh token encrypted. Removing the Google sender immediately returns
delivery to sendmail.

`EMAIL_DELAY_MIN_MS` and `EMAIL_DELAY_MAX_MS` define a random delay before each
queued notification. Failed deliveries retry up to three polling cycles.

## Polling behavior

The default schedule is 03:17 UTC each day:

```dotenv
POLL_CRON=17 3 * * *
POLL_TIMEZONE=UTC
```

Public polling state belongs to a repository and event type. The worker uses the
configured GitHub App user token once for that stream, then evaluates all active
public subscribers' conditions without refetching it. Public repositories never
need to be selected in a GitHub App installation.

Private polling state belongs to a subscription and event type. Each private
subscriber is polled independently with that user's OAuth token. Tokens are
never shuffled, selected from another subscriber, or used as fallbacks.

GitHub `401`, non-rate-limit `403`, `404`, and `410` responses are treated as
durable access failures. A public failure pauses every subscription to that
repository; a private failure pauses only the affected user's subscription. The
worker does not retry paused subscriptions automatically. It displays the error,
queues an email alert, and provides a **Retry repository access** action.
Rate-limit responses, server failures, and network errors remain transient and
are retried on the next polling cycle.

The current worker supports up to 1,000 commits or releases between checks and
uses the patches GitHub returns (GitHub can omit patches for binary or very
large diffs). A single SQLite-backed instance is the intended initial
deployment model.

## Docker deployment

Create `.env`, then run:

```sh
docker compose up --build
```

The Compose file mounts `/app/data` as a named volume. Prisma migrations run
before the server starts. Set `APP_URL` to the externally reachable HTTPS URL
and register its callback URLs with GitHub and Google.

The container includes a sendmail-compatible command, but production operators
must configure its mail transfer route or connect Gmail in the super-admin
settings.

## Development

```sh
pnpm test
pnpm lint
pnpm build
```

The application uses Next.js App Router, TypeScript, Prisma, SQLite, Vitest,
and `node-cron`.
