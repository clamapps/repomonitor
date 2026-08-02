import { z } from "zod";

import { requireRouteAdmin } from "@/lib/auth/session";
import { sendGmailEmail } from "@/lib/email/sender";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

const recipientSchema = z.string().trim().toLowerCase().email().max(254);

export async function POST(request: Request) {
  assertSameOrigin(request);
  await requireRouteAdmin();

  const form = await request.formData();
  const recipient = recipientSchema.safeParse(form.get("to"));
  if (!recipient.success) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Enter a valid test email recipient",
    );
  }

  try {
    await sendGmailEmail({
      to: recipient.data,
      subject: "RepoMonitor test email",
      text: [
        "This is a test email from RepoMonitor.",
        "",
        "The configured Gmail API sender is working correctly.",
      ].join("\n"),
      html: [
        "<p>This is a test email from RepoMonitor.</p>",
        "<p>The configured Gmail API sender is working correctly.</p>",
      ].join(""),
    });
    return redirectWithMessage(
      request,
      "/settings",
      "notice",
      `Test email sent to ${recipient.data}`,
    );
  } catch (error) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      error instanceof Error ? error.message : "Unable to send test email",
    );
  }
}
