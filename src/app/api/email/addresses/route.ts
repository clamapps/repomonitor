import { ZodError } from "zod";

import { requireRouteUser } from "@/lib/auth/session";
import { assertSameOrigin, redirectWithMessage, routeHandler } from "@/lib/http";
import {
  EmailVerificationError,
  requestEmailVerification,
} from "@/lib/email/verification";

export const POST = routeHandler(async (request: Request) => {
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
    if (error instanceof ZodError) {
      return redirectWithMessage(
        request,
        "/settings",
        "error",
        "Enter a valid email address",
      );
    }
    // Only messages written for users are shown; delivery and configuration
    // failures would otherwise leak internal detail into the browser.
    if (error instanceof EmailVerificationError) {
      return redirectWithMessage(request, "/settings", "error", error.message);
    }
    console.error("Failed to send a verification email", error);
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Unable to send the verification email. Try again later.",
    );
  }
});
