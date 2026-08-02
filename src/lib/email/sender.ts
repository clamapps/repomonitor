import "server-only";

import { spawn } from "node:child_process";

import { config } from "@/lib/config";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { buildRawEmail, OutboundEmail } from "@/lib/email/message";

let googleAccessToken:
  | { token: string; expiresAt: number; senderId: string }
  | undefined;

async function sendWithSendmail(message: OutboundEmail): Promise<void> {
  const raw = buildRawEmail(message, config().MAIL_FROM);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config().SENDMAIL_PATH, ["-t", "-i"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sendmail exited with ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(raw);
  });
}

async function googleToken(
  sender: { id: string; refreshTokenEncrypted: string },
): Promise<string> {
  if (
    googleAccessToken?.senderId === sender.id &&
    googleAccessToken.expiresAt > Date.now() + 60_000
  ) {
    return googleAccessToken.token;
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = config();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google email sender credentials are not configured");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: decryptSecret(sender.refreshTokenEncrypted),
      grant_type: "refresh_token",
    }),
  });
  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description ?? "Google token refresh failed");
  }
  googleAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
    senderId: sender.id,
  };
  return result.access_token;
}

async function sendWithGmail(
  message: OutboundEmail,
  sender: {
    id: string;
    email: string;
    refreshTokenEncrypted: string;
  },
): Promise<void> {
  const token = await googleToken(sender);
  const raw = Buffer.from(buildRawEmail(message, sender.email)).toString(
    "base64url",
  );
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      detail = parsed.error?.message ?? body;
    } catch {
      // Preserve a non-JSON response as the diagnostic detail.
    }
    throw new Error(
      `Gmail send failed (${response.status}): ${detail || response.statusText}`,
    );
  }
}

export async function sendGmailEmail(message: OutboundEmail): Promise<void> {
  const gmail = await db.gmailSender.findUnique({ where: { id: "global" } });
  if (!gmail) throw new Error("Google email sender is not connected");
  return sendWithGmail(message, gmail);
}

export async function sendEmail(message: OutboundEmail): Promise<void> {
  const gmail = await db.gmailSender.findUnique({ where: { id: "global" } });
  if (gmail) return sendWithGmail(message, gmail);
  return sendWithSendmail(message);
}

export function clearGoogleAccessTokenCache(): void {
  googleAccessToken = undefined;
}
