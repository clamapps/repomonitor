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

### Incremental authorization and partial consent

RepoMonitor sends `include_granted_scopes=true` with its authorization request,
so a later Google authorization can add permissions without discarding a grant
the account already gave this OAuth client. The connection flow asks only for
the identity scopes needed to verify the sender and the narrow `gmail.send`
scope needed by this feature.

Google can return fewer scopes than an application requested. RepoMonitor
checks the token response and refuses to save a sender unless `gmail.send` was
actually granted.

## 7. Configure Cross-Account Protection

RepoMonitor exposes a RISC security-event receiver at this production URL:

```text
https://repomonitor.example.com/api/google/risc
```

The receiver accepts only signed `application/secevent+jwt` events. It verifies
Google's RS256 signature, the discovered Google issuer, and the OAuth client ID
audience before acting. A matching token revocation, account revocation,
disabled account, or credential-change event deletes the saved Gmail sender and
clears its cached access token. Delivery then falls back to `sendmail` until a
super-admin reconnects Google.

To register the receiver:

1. Deploy RepoMonitor at the public HTTPS `APP_URL`. Google will not deliver
   RISC events to an HTTP endpoint.
2. In the same Google Cloud project as `GOOGLE_CLIENT_ID`, enable the **RISC
   API**, review the additional RISC terms, and accept them if appropriate for
   your deployment.
3. Create a service account and grant it **RISC Configuration Admin**
   (`roles/riscconfigs.admin`).
4. Create a JSON key for that service account. Keep the key outside this
   repository and delete it after registration if it is no longer needed.
5. From an environment whose `.env` has the production `APP_URL`, run:

   ```sh
   pnpm google:risc:configure path/to/service-account-key.json
   ```

The command registers `${APP_URL}/api/google/risc`, subscribes to the security
events RepoMonitor handles, and requests a verification event. The service
account key is used only by this one-shot command; it is not required by the
running application.

Google currently does not send Cross-Account Protection events for Google
Workspace accounts. The receiver can still be configured for the project, but
at present it protects connected consumer Google accounts only.

After deploying this change, reconnect an existing Gmail sender once. That
records the stable Google account subject used to match account-wide security
events. Token-specific revocation events can still be matched to the encrypted
refresh token.

Normally, the RISC receiver accepts `GOOGLE_CLIENT_ID` as its audience. If the
same deployment intentionally receives events for additional Google OAuth
clients, list their IDs as a comma-separated value:

```dotenv
GOOGLE_RISC_CLIENT_IDS=another-client.apps.googleusercontent.com
```

Do not add unrelated or obsolete client IDs. Each accepted ID broadens the set
of valid events delivered to this endpoint.

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

### Cross-Account Protection verification fails

- Confirm `APP_URL` is the public HTTPS URL and its domain is listed in the
  Google Auth Platform's authorized domains.
- Confirm the RISC API and terms were enabled in the same project as the OAuth
  client.
- Confirm the service account has `roles/riscconfigs.admin` in that project.
- Confirm the deployed database migration added `GmailSender.googleSubject`.
- Check the application logs for a rejected RISC signature/audience event or a
  database-processing failure. Security event contents are intentionally not
  logged.

## Google documentation

- [Gmail API server-side authorization](https://developers.google.com/workspace/gmail/api/auth/web-server)
- [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [`users.messages.send`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Manage OAuth clients](https://support.google.com/cloud/answer/15549257)
- [Manage app data access](https://support.google.com/cloud/answer/15549135)
- [Manage app audience](https://support.google.com/cloud/answer/15549945)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Cross-Account Protection (RISC)](https://developers.google.com/identity/protocols/risc)
