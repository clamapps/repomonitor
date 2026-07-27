import { ZodError } from "zod";

import { requireRouteUser } from "@/lib/auth/session";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";
import { requestEmailVerification } from "@/lib/email/verification";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const form = await request.formData();
  try {
    await requestEmailVerification(user.id, String(form.get("email") ?? ""));
    return redirectWithMessage(
      request,
      "/settings",
      "notice",
      "Verification email sent",
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? "Enter a valid email address"
        : error instanceof Error
          ? error.message
          : "Unable to send verification";
    return redirectWithMessage(request, "/settings", "error", message);
  }
}
