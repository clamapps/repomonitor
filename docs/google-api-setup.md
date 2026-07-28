# Google API and Gmail sender setup

RepoMonitor can use one Google account as the global sender for all
notifications. It uses Google's server-side OAuth flow, stores an encrypted
refresh token, and sends mail through the Gmail API.

Only the **Gmail API** needs to be enabled. RepoMonitor does not need the People
API, Gmail Postmaster Tools API, a service account, or Google Workspace
domain-wide delegation.

## Choose `APP_URL` first

Set `APP_URL` to the URL users enter in their browser, without a trailing slash:

```dotenv
# Local development
APP_URL=http://localhost:3000

# Production example
APP_URL=https://repomonitor.example.com
```

The Google OAuth redirect URI is `APP_URL` followed by
`/api/admin/gmail/callback`:

```text
http://localhost:3000/api/admin/gmail/callback
https://repomonitor.example.com/api/admin/gmail/callback
```

Google compares redirect URIs exactly, including the scheme, hostname, port,
path, and trailing slash. Use HTTPS for a production `APP_URL`.

## 1. Create or select a Google Cloud project

1. Open the [Google Cloud console](https://console.cloud.google.com/).
2. Use the project selector to create a project or select one dedicated to
   RepoMonitor.
3. Confirm that the intended project remains selected while completing the
   rest of this guide.

Using separate projects or OAuth clients for development and production keeps
credentials and consent configuration isolated. A single web client can have
multiple redirect URIs, however, so both callback URLs can be registered on one
client when that trade-off is acceptable.

## 2. Enable the Gmail API

1. Open **APIs & Services > Library**.
2. Search for **Gmail API**.
3. Select **Gmail API** and choose **Enable**.

No other mail-related Google API is required. RepoMonitor calls
`users.messages.send` and does not read messages, drafts, contacts, or mailbox
settings.

## 3. Configure the Google Auth Platform

Open **Google Auth Platform** for the selected project and complete its initial
configuration if necessary.

### Branding

Set an app name such as `RepoMonitor`, choose a user-support email, and add a
developer contact email. Production apps may also need an application home
page, privacy policy, terms of service, and verified domains as part of
Google's verification process.

### Audience

Choose the audience that matches the deployment:

- **Internal** is available to projects in a Google Workspace organization and
  limits authorization to accounts in that organization.
- **External** permits consumer Google accounts and accounts outside the
  project's organization.

An External app starts in **Testing**. Add the Google account that will send
RepoMonitor mail as a test user before connecting it. Testing is convenient
for initial setup, but an authorization that includes `gmail.send` expires
after seven days, including its refresh token.

For a lasting sender connection, use an Internal app or move an External app
to **In production**. `gmail.send` is a sensitive scope, so an External
production app may show an unverified-app warning and may need Google's OAuth
verification, depending on how the deployment is distributed.

### Data access

RepoMonitor requests exactly these scopes:

| Scope | Purpose |
| --- | --- |
| `openid` | Identify the authorized Google account |
| `email` | Read its verified primary email address and confirm it matches the configured sender |
| `https://www.googleapis.com/auth/gmail.send` | Send messages as the authorized account |

Under **Data Access**, use **Add or remove scopes** and add the Gmail scope
`https://www.googleapis.com/auth/gmail.send`. Keep the standard OpenID `openid`
and email scopes if the console lists them separately. Do not replace
`gmail.send` with the broader `gmail.compose`, `gmail.modify`, or
`https://mail.google.com/` scopes.

## 4. Create the OAuth client

1. Open **Google Auth Platform > Clients**.
2. Select **Create client**.
3. Choose **Web application** as the application type.
4. Give it an environment-specific name, such as
   `RepoMonitor (local)`.
5. Leave **Authorized JavaScript origins** empty. RepoMonitor performs the flow
   on the server and does not call Google APIs from browser JavaScript.
6. Under **Authorized redirect URIs**, add the exact callback for this
   environment:

   ```text
   http://localhost:3000/api/admin/gmail/callback
   ```

   For production, use the public `APP_URL`, for example:

   ```text
   https://repomonitor.example.com/api/admin/gmail/callback
   ```

7. Create the client and copy its **Client ID** and **Client secret**.

Treat the client secret as a secret. Do not commit it or place it in browser
code.

## 5. Configure RepoMonitor

Add the client credentials to `.env`:

```dotenv
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

Also confirm the following values:

```dotenv
APP_URL=http://localhost:3000
SUPER_ADMIN_GITHUB_LOGINS=your-github-login
```

Restart RepoMonitor after changing the environment. Keep `ENCRYPTION_KEY`
stable: RepoMonitor uses it to encrypt the Google refresh token stored in the
database.

## 6. Connect the sender

1. Sign in to RepoMonitor using a GitHub login listed in
   `SUPER_ADMIN_GITHUB_LOGINS`.
2. Open **Settings**.
3. Under **Google email sender**, enter the Google account's primary email
   address.
4. Select **Connect with Google**.
5. Sign in with that same Google account and grant the requested send
   permission.

The entered address must match the verified primary email returned by Google.
The account must have a Gmail or Google Workspace mailbox; sender aliases are
not supported by this connection flow.

Once connected, RepoMonitor uses this account for every notification and
ignores `MAIL_FROM`. Removing the Google sender in Settings immediately returns
delivery to the configured `sendmail` command.

## Troubleshooting

### `redirect_uri_mismatch`

Check all of the following:

- `APP_URL` uses the same scheme, hostname, and port as the registered redirect
  URI.
- `APP_URL` has no trailing slash.
- The registered path is exactly `/api/admin/gmail/callback`.
- The URI is listed on the **Web application** client whose ID is assigned to
  `GOOGLE_CLIENT_ID`.
- RepoMonitor was restarted after the environment changed.

### The app is blocked or the account cannot authorize

- For an External app in Testing, add the sender account under
  **Google Auth Platform > Audience > Test users**.
- For an Internal app, use an account in the Google Workspace organization
  that owns the Cloud project.
- A Google Workspace administrator can restrict third-party app access. The
  administrator may need to trust the OAuth client or allow its scopes.
- Grant the Gmail send permission during consent. RepoMonitor cannot send if
  granular consent omits `gmail.send`.

### The sender stops working after seven days

This is expected for an External app whose publishing status is **Testing**.
Move the app to **In production** or use an Internal app, then remove and
reconnect the sender so RepoMonitor receives a new refresh token.

### `Gmail API has not been used` or `accessNotConfigured`

Enable **Gmail API** in the same Google Cloud project that owns the configured
OAuth client. Enabling an API in a different project does not enable it for
this client.

### `invalid_grant` or token refresh failures

The refresh token may have expired or been revoked, the OAuth client may have
changed, or the account owner may have removed access in their Google Account.
Remove and reconnect the sender in RepoMonitor Settings. If the connection
cannot be removed cleanly, verify the client credentials and publishing status
before trying again.

## Google documentation

- [Gmail API server-side authorization](https://developers.google.com/workspace/gmail/api/auth/web-server)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [`users.messages.send`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Manage OAuth clients](https://support.google.com/cloud/answer/15549257)
- [Manage app data access](https://support.google.com/cloud/answer/15549135)
- [Manage app audience](https://support.google.com/cloud/answer/15549945)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
