import "server-only";

import { EmailSource } from "@prisma/client";
import { z } from "zod";

import { config } from "@/lib/config";
import { hashToken, randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/email/message";
import { sendEmail } from "@/lib/email/sender";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const RESEND_INTERVAL_MS = 60_000;
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
/** Bounds how many third-party inboxes one account can reach. */
const MAX_ADDRESSES_PER_USER = 10;
const MAX_SENDS_PER_HOUR = 5;
/** Send rows outlive the throttle window only long enough to stay auditable. */
const SEND_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class EmailVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

export async function requestEmailVerification(
  userId: string,
  rawEmail: string,
): Promise<void> {
  const email = emailSchema.parse(rawEmail);
  const existing = await db.emailAddress.findUnique({
    where: { userId_email: { userId, email } },
  });
  if (existing?.verifiedAt) {
    throw new EmailVerificationError("That email address is already verified");
  }

  if (!existing) {
    const addressCount = await db.emailAddress.count({ where: { userId } });
    if (addressCount >= MAX_ADDRESSES_PER_USER) {
      throw new EmailVerificationError(
        "You have reached the maximum number of email addresses. Delete one before adding another.",
      );
    }
  }

  const now = Date.now();
  const lastSend = await db.emailVerificationSend.findFirst({
    where: { userId, email },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastSend && lastSend.createdAt.getTime() > now - RESEND_INTERVAL_MS) {
    throw new EmailVerificationError(
      "A verification email was sent recently. Try again shortly.",
    );
  }

  // Throttle across addresses, not just per address: otherwise an account can
  // send unlimited mail to arbitrary recipients by cycling through addresses.
  const recentSends = await db.emailVerificationSend.count({
    where: { userId, createdAt: { gt: new Date(now - SEND_WINDOW_MS) } },
  });
  if (recentSends >= MAX_SENDS_PER_HOUR) {
    throw new EmailVerificationError(
      "Too many verification emails were requested. Try again in an hour.",
    );
  }

  const token = randomToken();
  await db.$transaction(async (tx) => {
    await tx.emailAddress.upsert({
      where: { userId_email: { userId, email } },
      update: {
        source: EmailSource.CUSTOM,
        verificationHash: hashToken(token),
        verificationExpires: new Date(now + TOKEN_LIFETIME_MS),
      },
      create: {
        userId,
        email,
        source: EmailSource.CUSTOM,
        verificationHash: hashToken(token),
        verificationExpires: new Date(now + TOKEN_LIFETIME_MS),
      },
    });
    // Recorded before delivery is attempted: a send that fails midway may
    // still have reached the recipient, so it must count against the throttle.
    await tx.emailVerificationSend.create({ data: { userId, email } });
    await tx.emailVerificationSend.deleteMany({
      where: { userId, createdAt: { lt: new Date(now - SEND_RETENTION_MS) } },
    });
  });

  const verificationUrl = `${config().APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Verify your RepoMonitor email",
    text: `Confirm this address for RepoMonitor notifications:\n\n${verificationUrl}\n\nYou will be asked to sign in and confirm. This link expires in 24 hours.\n\nIf you did not request this, ignore this email — no notifications are sent to an address until it is confirmed.`,
    html: `<p>Confirm this address for RepoMonitor notifications:</p><p><a href="${escapeHtml(verificationUrl)}">Verify email address</a></p><p>You will be asked to sign in and confirm. This link expires in 24 hours.</p><p>If you did not request this, ignore this email — no notifications are sent to an address until it is confirmed.</p>`,
  });
}

export type PendingVerification = {
  email: string;
  userId: string;
};

/**
 * Looks up a pending verification without consuming it, so the confirmation
 * page can be rendered by a GET without changing state.
 */
export async function pendingVerification(
  token: string,
): Promise<PendingVerification | null> {
  const address = await db.emailAddress.findUnique({
    where: { verificationHash: hashToken(token) },
  });
  if (
    !address ||
    !address.verificationExpires ||
    address.verificationExpires <= new Date()
  ) {
    return null;
  }
  return { email: address.email, userId: address.userId };
}

/**
 * Consumes a verification token. Possession of the token proves control of the
 * mailbox; requiring the matching signed-in account proves the address was
 * actually requested by its owner.
 */
export async function verifyEmailToken(
  token: string,
  userId: string,
): Promise<string | null> {
  const address = await db.emailAddress.findUnique({
    where: { verificationHash: hashToken(token) },
  });
  if (
    !address ||
    address.userId !== userId ||
    !address.verificationExpires ||
    address.verificationExpires <= new Date()
  ) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: address.userId },
    select: { notificationEmailId: true },
  });

  await db.$transaction(async (tx) => {
    await tx.emailAddress.update({
      where: { id: address.id },
      data: {
        verifiedAt: new Date(),
        verificationHash: null,
        verificationExpires: null,
      },
    });
    // Selecting where the notification stream goes stays an explicit action;
    // only fill it in when the account has no address selected yet.
    if (!user?.notificationEmailId) {
      await tx.user.update({
        where: { id: address.userId },
        data: { notificationEmailId: address.id },
      });
    }
  });
  return address.email;
}
