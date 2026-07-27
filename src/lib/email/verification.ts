import "server-only";

import { EmailSource } from "@prisma/client";
import { z } from "zod";

import { config } from "@/lib/config";
import { hashToken, randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/email/message";
import { sendEmail } from "@/lib/email/sender";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function requestEmailVerification(
  userId: string,
  rawEmail: string,
): Promise<void> {
  const email = emailSchema.parse(rawEmail);
  const existing = await db.emailAddress.findUnique({
    where: { userId_email: { userId, email } },
  });
  if (
    existing?.verificationExpires &&
    existing.updatedAt.getTime() > Date.now() - 60_000
  ) {
    throw new Error("A verification email was sent recently. Try again shortly.");
  }
  if (existing?.verifiedAt) {
    throw new Error("That email address is already verified");
  }

  const token = randomToken();
  await db.emailAddress.upsert({
    where: { userId_email: { userId, email } },
    update: {
      source: EmailSource.CUSTOM,
      verificationHash: hashToken(token),
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    create: {
      userId,
      email,
      source: EmailSource.CUSTOM,
      verificationHash: hashToken(token),
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const verificationUrl = `${config().APP_URL}/api/email/verify?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Verify your RepoMonitor email",
    text: `Confirm this address for RepoMonitor notifications:\n\n${verificationUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Confirm this address for RepoMonitor notifications:</p><p><a href="${escapeHtml(verificationUrl)}">Verify email address</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function verifyEmailToken(token: string): Promise<string | null> {
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
  await db.$transaction([
    db.emailAddress.update({
      where: { id: address.id },
      data: {
        verifiedAt: new Date(),
        verificationHash: null,
        verificationExpires: null,
      },
    }),
    db.user.update({
      where: { id: address.userId },
      data: { notificationEmailId: address.id },
    }),
  ]);
  return address.email;
}
