import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(repositoryRoot, "build", "styledev");
const zipPath = path.join(
  repositoryRoot,
  "build",
  "repomonitor-styledev.zip",
);

function eventBadge(type) {
  const isCommit = type === "commit";
  return `
    <span class="event-badge event-${type}">
      <span class="event-symbol" aria-hidden="true">${isCommit ? "↗" : "◆"}</span>
      ${isCommit ? "Commits" : "Releases"}
    </span>`;
}

function flash(type, message) {
  const isError = type === "error";
  return `
    <div class="flash flash-${type}" role="${isError ? "alert" : "status"}">
      <span aria-hidden="true">${isError ? "!" : "✓"}</span>
      <p>${message}</p>
    </div>`;
}

function header(activePage) {
  return `
    <header class="site-header">
      <div class="shell header-inner">
        <a class="brand" href="home.html" aria-label="RepoMonitor home">
          <span class="brand-mark" aria-hidden="true">R</span>
          <span>RepoMonitor</span>
        </a>
        <nav class="nav" aria-label="Primary navigation">
          <a href="home.html"${activePage === "home" ? ' aria-current="page"' : ""}>Subscriptions</a>
          <a href="settings.html"${activePage === "settings" ? ' aria-current="page"' : ""}>
            Settings <span class="admin-dot" title="Super-admin"></span>
          </a>
          <button class="link-button" type="button" data-demo-action="Signed out">
            Sign out
          </button>
        </nav>
      </div>
    </header>`;
}

const interactionScript = `
  <script>
    (() => {
      const actionToast = document.querySelector("[data-action-toast]");
      let toastTimer;

      const showActionToast = (message) => {
        if (!actionToast) return;
        actionToast.querySelector("p").textContent =
          message + " (preview only — no data was changed).";
        actionToast.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          actionToast.hidden = true;
        }, 4200);
      };

      document.querySelectorAll("form").forEach((form) => {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const submitter = event.submitter;
          showActionToast(
            submitter?.textContent?.trim() || form.dataset.demoAction || "Saved"
          );
        });
      });

      document.querySelectorAll("[data-demo-action]").forEach((element) => {
        element.addEventListener("click", () => {
          showActionToast(element.dataset.demoAction || element.textContent.trim());
        });
      });

      document.querySelectorAll("[data-condition-toggle]").forEach((button) => {
        const menu = document.getElementById(button.getAttribute("aria-controls"));
        if (!menu) return;

        const setOpen = (isOpen) => {
          menu.hidden = !isOpen;
          button.setAttribute("aria-expanded", String(isOpen));
        };

        button.addEventListener("click", () => {
          setOpen(button.getAttribute("aria-expanded") !== "true");
        });

        document.addEventListener("pointerdown", (event) => {
          if (!menu.hidden && !button.parentElement.contains(event.target)) {
            setOpen(false);
          }
        });

        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !menu.hidden) {
            setOpen(false);
            button.focus();
          }
        });
      });
    })();
  </script>`;

function documentTemplate({ title, activePage, main }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} · RepoMonitor style preview</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  ${header(activePage)}
  ${main}
  <div class="styledev-action-toast flash flash-notice" role="status" data-action-toast hidden>
    <span aria-hidden="true">✓</span>
    <p>Preview action completed.</p>
  </div>
  ${interactionScript}
</body>
</html>
`;
}

const repositoryCards = [
  {
    monogram: "O",
    status: "Monitoring",
    name: "openai/codex",
    meta: "Public · main",
    events: ["commit", "release"],
    footer: "4 conditions",
  },
  {
    monogram: "A",
    status: "Monitoring",
    name: "acme-inc/private-api",
    meta: "Private · production",
    events: ["commit"],
    footer: "2 conditions",
  },
  {
    monogram: "D",
    status: "Monitoring",
    name: "design-lab/component-library",
    meta: "Public · trunk",
    events: ["release"],
    footer: "1 condition",
  },
  {
    monogram: "L",
    status: "Action needed",
    name: "legacy-co/archived-service",
    meta: "Private · main",
    events: ["commit", "release"],
    footer: "GitHub returned 404. Access may have been removed.",
    error: true,
  },
];

const homeHtml = documentTemplate({
  title: "Subscriptions",
  activePage: "home",
  main: `
    <main class="shell dashboard">
      <section class="styledev-message-stack" aria-label="Example notifications">
        ${flash("notice", "Repository added. Monitoring starts from the current version.")}
        ${flash("error", "One repository needs attention. Restore access before retrying.")}
      </section>

      <section class="dashboard-heading">
        <div>
          <p class="eyebrow">Your watchlist</p>
          <h1>Subscriptions</h1>
          <p>4 repositories under watch.</p>
        </div>
        <a class="button button-primary" href="#add-repository">
          <span aria-hidden="true">+</span> Add repository
        </a>
      </section>

      <section class="subscription-grid" aria-label="Subscriptions">
        ${repositoryCards
          .map(
            (repository) => `
          <a class="repo-card${repository.error ? " repo-card-error" : ""}" href="subscription.html">
            <div class="repo-card-top">
              <span class="repo-monogram" aria-hidden="true">${repository.monogram}</span>
              <span class="status-line${repository.error ? " status-line-error" : ""}">
                <i></i>${repository.status}
              </span>
            </div>
            <h2>${repository.name}</h2>
            <p class="repo-meta">${repository.meta}</p>
            <div class="badge-row">
              ${repository.events.map(eventBadge).join("")}
            </div>
            <div class="repo-card-footer">
              <span>${repository.footer}</span>
              <span class="arrow" aria-hidden="true">→</span>
            </div>
          </a>`,
          )
          .join("")}
      </section>

      <section class="panel add-panel" id="add-repository">
        <div class="panel-copy">
          <p class="eyebrow">New subscription</p>
          <h2>Add a repository</h2>
          <p>
            Public or private is available. Private repositories use only your
            GitHub token.
          </p>
        </div>
        <form class="add-form" data-demo-action="Repository added">
          <label>
            GitHub repository
            <input
              name="repository"
              value="octo-org/example-repository"
              placeholder="owner/repository"
              autocomplete="off"
            >
            <small>Paste owner/repo or the full GitHub URL.</small>
          </label>
          <fieldset class="event-choices">
            <legend>Watch for</legend>
            <label class="check-card">
              <input name="commits" type="checkbox" checked>
              <span>
                <b>↗</b>
                <strong>Commits</strong>
                <small>Default branch changes</small>
              </span>
            </label>
            <label class="check-card">
              <input name="releases" type="checkbox">
              <span>
                <b>◆</b>
                <strong>Releases</strong>
                <small>Published tags</small>
              </span>
            </label>
          </fieldset>
          <button class="button button-primary" type="submit">
            Add and configure
          </button>
        </form>
      </section>
    </main>`,
});

function conditionRow({
  index,
  icon,
  type,
  title,
  code,
  detail,
  activityStatus,
  activity,
}) {
  return `
    <article class="condition-row">
      <span class="condition-index">${String(index).padStart(2, "0")}</span>
      <div class="condition-icon" aria-hidden="true">${icon}</div>
      <div class="condition-copy">
        <small>${type}</small>
        <h3>${title}</h3>
        ${code ? `<code>${code}</code>` : ""}
        ${detail ? `<span>${detail}</span>` : ""}
      </div>
      <div class="condition-activity">
        ${activityStatus ? `<strong>${activityStatus}</strong>` : ""}
        <span>${activity}</span>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="Remove condition"
        title="Remove condition"
        data-demo-action="Condition removed"
      >×</button>
    </article>`;
}

function addConditionMenu() {
  return `
    <div class="add-condition">
      <button
        class="button button-primary button-small add-condition-toggle"
        type="button"
        aria-expanded="true"
        aria-controls="condition-menu-commit"
        data-condition-toggle
      >
        + Add condition
      </button>
      <div
        class="condition-menu"
        id="condition-menu-commit"
        role="group"
        aria-label="Add condition"
      >
        <form data-demo-action="Text condition added">
          <input type="hidden" name="eventType" value="COMMIT">
          <input type="hidden" name="conditionType" value="TEXT_CONTAINS">
          <strong>Text contains</strong>
          <p>Search messages, release notes, paths, and available diffs.</p>
          <label>
            Text to match
            <input
              name="textPattern"
              value="breaking change"
              placeholder="breaking change"
              required
            >
          </label>
          <button class="button button-primary button-small" type="submit">
            Add text condition
          </button>
        </form>
        <div class="menu-rule"></div>
        <form data-demo-action="Line condition captured">
          <input type="hidden" name="eventType" value="COMMIT">
          <input type="hidden" name="conditionType" value="LINE_CHANGE">
          <strong>Specific line changes</strong>
          <p>Paste a GitHub permalink, or enter a file and line manually.</p>
          <div class="split-fields">
            <label>
              File path or permalink
              <input
                name="filePath"
                value="https://github.com/other/repo/blob/main/config.ts"
                aria-invalid="true"
                aria-describedby="example-location-error"
                required
              >
              <small class="field-error" id="example-location-error">
                Use a permalink from openai/codex with a line anchor.
              </small>
            </label>
            <label>
              Line
              <input name="lineNumber" type="number" min="1" value="42" required>
            </label>
          </div>
          <fieldset class="line-triggers">
            <legend>Notify me if the captured line is</legend>
            <label>
              <input type="checkbox" name="notifyOnRemoved" checked>
              Removed/readded
            </label>
            <label>
              <input type="checkbox" name="notifyOnMoved" checked>
              Moved
            </label>
            <label>
              <input type="checkbox" name="notifyOnChanged">
              Changed
            </label>
          </fieldset>
          <small class="field-error" role="alert">
            Example validation: select at least one notification trigger.
          </small>
          <button class="button button-primary button-small" type="submit">
            Capture line
          </button>
        </form>
      </div>
    </div>`;
}

const subscriptionHtml = documentTemplate({
  title: "Subscription",
  activePage: "home",
  main: `
    <main class="shell detail-page">
      <section class="styledev-message-stack" aria-label="Example notifications">
        ${flash("notice", "Condition saved. The current repository state is now the baseline.")}
        ${flash("error", "The most recent notification could not be delivered and will be retried.")}
      </section>

      <a class="back-link" href="home.html">← Subscriptions</a>
      <section class="detail-hero">
        <div>
          <div class="detail-kicker">
            <span class="status-line"><i></i>Monitoring</span>
            <span>Public</span>
          </div>
          <h1>openai/codex</h1>
          <p>
            Watching <strong>main</strong> once a day through public GitHub access.
          </p>
          <a class="external-link" href="https://github.com/openai/codex">
            Open on GitHub ↗
          </a>
        </div>
        <form class="event-settings" data-demo-action="Event settings saved">
          <strong>Events</strong>
          <label>
            <input type="checkbox" name="commits" checked> Commits
          </label>
          <label>
            <input type="checkbox" name="releases" checked> Releases
          </label>
          <button class="button button-secondary button-small" type="submit">
            Save
          </button>
        </form>
      </section>

      <section class="subscription-error" role="alert">
        <div>
          <p class="eyebrow">Example repository access error</p>
          <h2>Monitoring can be paused</h2>
          <p>GitHub returned 404. The repository may be private or access may have been removed.</p>
          <small>
            This example shows the durable error state and recovery action.
          </small>
        </div>
        <button
          class="button button-primary"
          type="button"
          data-demo-action="Repository access retry queued"
        >
          Retry repository access
        </button>
      </section>

      <section class="event-section">
        <header class="event-section-header">
          <div>
            ${eventBadge("commit")}
            <h2>Commit conditions</h2>
            <p>Matches new commits on the default branch.</p>
          </div>
          ${addConditionMenu()}
        </header>
        <div class="condition-list">
          ${conditionRow({
            index: 1,
            icon: "T",
            type: "TEXT CONTAINS",
            title: "“breaking change”",
            activityStatus: "SENT · 2 HOURS AGO",
            activity: "refactor!: simplify configuration loading",
          })}
          ${conditionRow({
            index: 2,
            icon: "≠",
            type: "LINE CHANGE",
            title: "src/config.ts:42",
            code: "export const defaultModel = &quot;gpt-5&quot;;",
            detail:
              "Alerts: removed/readded, moved, changed · baseline a1b2c3d · observed f4e5d6c",
            activityStatus: "QUEUED",
            activity: "Update default model selection",
          })}
          ${conditionRow({
            index: 3,
            icon: "T",
            type: "TEXT CONTAINS",
            title: "“security”",
            activity: "No matches yet",
          })}
        </div>
      </section>

      <section class="event-section">
        <header class="event-section-header">
          <div>
            ${eventBadge("release")}
            <h2>Release conditions</h2>
            <p>Release text and code are checked at the release tag.</p>
          </div>
          <button
            class="button button-primary button-small"
            type="button"
            data-demo-action="Release condition menu would open"
          >
            + Add condition
          </button>
        </header>
        <div class="condition-list">
          ${conditionRow({
            index: 1,
            icon: "T",
            type: "TEXT CONTAINS",
            title: "“deprecated”",
            activityStatus: "FAILED",
            activity: "v2.4.0 release notes",
          })}
          ${conditionRow({
            index: 2,
            icon: "≠",
            type: "LINE CHANGE",
            title: "package.json:4",
            code: "&quot;version&quot;: &quot;2.4.0&quot;,",
            detail:
              "Alerts: changed · baseline 9ab32e1 · observed 71cd883",
            activityStatus: "SENT · 4 DAYS AGO",
            activity: "Release v2.4.0",
          })}
        </div>
      </section>

      <section class="danger-zone">
        <div>
          <h2>Remove subscription</h2>
          <p>Stops monitoring this repository for your account.</p>
        </div>
        <button
          class="button button-danger"
          type="button"
          data-demo-action="Repository removal requested"
        >
          Remove repository
        </button>
      </section>
    </main>`,
});

const settingsHtml = documentTemplate({
  title: "Settings",
  activePage: "settings",
  main: `
    <main class="shell settings-page">
      <section class="styledev-message-stack" aria-label="Example notifications">
        ${flash("notice", "Notification address updated to designer@example.com.")}
        ${flash("error", "Verification link expired. Send a new verification email and try again.")}
      </section>

      <section class="page-title">
        <p class="eyebrow">Account</p>
        <h1>Settings</h1>
        <p>Choose where alerts land and manage service-level delivery.</p>
      </section>

      <section class="settings-card">
        <header>
          <span class="settings-number">01</span>
          <div>
            <h2>Notification email</h2>
            <p>Alerts are sent only to a verified address you select.</p>
          </div>
        </header>
        <div class="email-list">
          <form class="email-option email-selected" data-demo-action="Email already selected">
            <input type="hidden" name="emailAddressId" value="selected">
            <span class="radio-mark" aria-hidden="true"></span>
            <div>
              <strong>designer@example.com</strong>
              <span>Custom · Verified</span>
            </div>
            <span class="email-actions">
              <button class="button button-secondary button-small" type="submit" disabled>
                Selected
              </button>
              <button
                class="icon-button email-remove-button"
                type="submit"
                aria-label="Remove designer@example.com"
                title="Remove custom email address"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"></path>
                </svg>
              </button>
            </span>
          </form>
          <form class="email-option" data-demo-action="GitHub email selected">
            <input type="hidden" name="emailAddressId" value="github">
            <span class="radio-mark" aria-hidden="true"></span>
            <div>
              <strong>octocat@github.example</strong>
              <span>GitHub · Verified</span>
            </div>
            <span class="email-actions">
              <button class="button button-secondary button-small" type="submit">Use</button>
            </span>
          </form>
          <form class="email-option" data-demo-action="Verification email resent">
            <input type="hidden" name="emailAddressId" value="pending">
            <span class="radio-mark" aria-hidden="true"></span>
            <div>
              <strong>alerts@example.com</strong>
              <span>Custom · Awaiting verification</span>
            </div>
            <span class="email-actions">
              <span class="pending-pill">Pending</span>
              <button
                class="icon-button email-remove-button"
                type="submit"
                aria-label="Remove alerts@example.com"
                title="Remove custom email address"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6"></path>
                </svg>
              </button>
            </span>
          </form>
        </div>
        <form class="inline-form" data-demo-action="Verification email sent">
          <label>
            Add a custom address
            <span>
              <input
                type="email"
                name="email"
                value="new-address@example.com"
                placeholder="you@example.com"
                required
              >
              <button class="button button-primary" type="submit">
                Send verification
              </button>
            </span>
          </label>
        </form>
      </section>

      <section class="settings-card">
        <header>
          <span class="settings-number">02</span>
          <div>
            <h2>GitHub connection</h2>
            <p>The stored token supplies read access for background checks.</p>
          </div>
        </header>
        <div class="connection-row">
          <span class="repo-monogram">O</span>
          <div>
            <strong>@octocat</strong>
            <span>Connected · private repository access enabled</span>
          </div>
          <button
            class="button button-secondary button-small"
            type="button"
            data-demo-action="Private repository access change started"
          >
            Disable private access
          </button>
        </div>
        <p class="form-hint">
          Public repositories are polled through the service GitHub App.
          Changing this setting replaces the stored user token and may pause
          existing private subscriptions.
        </p>
      </section>

      <section class="settings-card admin-card">
        <header>
          <span class="settings-number">A</span>
          <div>
            <p class="eyebrow">Super-admin</p>
            <h2>Service delivery</h2>
            <p>Configure public polling, the sender, and the daily job.</p>
          </div>
        </header>
        <div class="admin-grid">
          <div class="admin-block">
            <small>PUBLIC REPOSITORY POLLING</small>
            <div class="connected-sender">
              <span class="github-app-mark">GH</span>
              <div>
                <strong>repomonitor-public</strong>
                <span>Authorized as @octocat · public data only</span>
              </div>
            </div>
            <div class="button-row">
              <button
                class="button button-secondary button-small"
                type="button"
                data-demo-action="GitHub App reauthorization started"
              >
                Reauthorize
              </button>
              <button
                class="button button-secondary button-small"
                type="button"
                data-demo-action="GitHub App settings opened"
              >
                Manage GitHub App
              </button>
            </div>
            <span class="form-hint">
              Public repositories remain public. The app token supplies the
              authenticated API rate limit.
            </span>
          </div>
          <div class="admin-block">
            <small>GOOGLE EMAIL SENDER</small>
            <div class="connected-sender">
              <span class="google-mark">G</span>
              <div>
                <strong>sender@example.com</strong>
                <span>Gmail API · connected</span>
              </div>
            </div>
            <button
              class="button button-secondary button-small"
              type="button"
              data-demo-action="Email delivery reverted to sendmail"
            >
              Revert to sendmail
            </button>
            <span class="form-hint">
              This sender is used for all future notifications.
            </span>
          </div>
          <div class="admin-block">
            <small>DAILY POLL</small>
            <p>Last completed 28/07/2026, 3:17:04 am UTC.</p>
            <button
              class="button button-primary button-small"
              type="button"
              data-demo-action="Manual poll started"
            >
              Poll now
            </button>
            <span class="form-hint">
              This can take a few minutes and sends real notifications.
            </span>
          </div>
        </div>
      </section>
    </main>`,
});

const previewStyles = `

/* Static style-development artifact helpers. */
.styledev-message-stack {
  margin-block: 20px 34px;
}

.styledev-message-stack .flash {
  margin-block: 8px;
}

.styledev-action-toast {
  position: fixed;
  z-index: 100;
  right: 20px;
  bottom: 20px;
  width: min(430px, calc(100% - 40px));
  margin: 0;
  box-shadow: 5px 5px 0 rgba(21, 22, 20, 0.25);
}

.styledev-action-toast[hidden],
.condition-menu[hidden] {
  display: none;
}

.nav a[aria-current="page"] {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--orange);
  text-decoration-thickness: 3px;
  text-underline-offset: 7px;
}
`;

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data);
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(33, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(33, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const sourceStyles = await readFile(
  path.join(repositoryRoot, "src", "app", "globals.css"),
  "utf8",
);
const outputFiles = new Map([
  ["home.html", homeHtml],
  ["subscription.html", subscriptionHtml],
  ["settings.html", settingsHtml],
  [
    "styles.css",
    `/* Generated from src/app/globals.css by pnpm build:styledev. */\n${sourceStyles}${previewStyles}`,
  ],
]);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  [...outputFiles].map(([name, contents]) =>
    writeFile(path.join(outputDirectory, name), contents),
  ),
);
await mkdir(path.dirname(zipPath), { recursive: true });
await writeFile(
  zipPath,
  createZip(
    [...outputFiles].map(([name, data]) => ({
      name,
      data: Buffer.from(data),
    })),
  ),
);

console.log("Style development bundle created:");
console.log(`  HTML and CSS: ${outputDirectory}`);
console.log(`  ZIP archive:  ${zipPath}`);
