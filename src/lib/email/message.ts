export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubject(value: string): string {
  const cleaned = cleanHeader(value);
  if (/^[\x20-\x7E]*$/.test(cleaned)) return cleaned;
  return `=?UTF-8?B?${Buffer.from(cleaned).toString("base64")}?=`;
}

export function buildRawEmail(
  message: OutboundEmail,
  from: string,
): string {
  const boundary = `repomonitor-${crypto.randomUUID()}`;
  const headers = [
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(message.to)}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (!message.html) {
    return [
      ...headers,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      message.text,
    ].join("\r\n");
  }

  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
