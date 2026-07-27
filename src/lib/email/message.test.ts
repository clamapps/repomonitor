import { describe, expect, it } from "vitest";

import { buildRawEmail, escapeHtml } from "@/lib/email/message";

describe("email message rendering", () => {
  it("builds a multipart message with safe headers", () => {
    const raw = buildRawEmail(
      {
        to: "reader@example.com\r\nBcc: attacker@example.com",
        subject: "Repository changed\r\nX-Injected: yes",
        text: "Plain version",
        html: "<p>HTML version</p>",
      },
      "RepoMonitor <sender@example.com>",
    );

    expect(raw).toContain("To: reader@example.com Bcc: attacker@example.com");
    expect(raw).toContain("Subject: Repository changed X-Injected: yes");
    expect(raw).not.toContain("\r\nBcc: attacker@example.com");
    expect(raw).not.toContain("\r\nX-Injected: yes");
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("Plain version");
    expect(raw).toContain("<p>HTML version</p>");
  });

  it("escapes user-controlled HTML", () => {
    expect(escapeHtml(`<script data-x="1">&</script>`)).toBe(
      "&lt;script data-x=&quot;1&quot;&gt;&amp;&lt;/script&gt;",
    );
  });
});
