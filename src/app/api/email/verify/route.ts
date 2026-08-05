import { requireRouteUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { verifyEmailToken } from "@/lib/email/verification";
import {
  assertSameOrigin,
  formString,
  redirectWithMessage,
  routeHandler,
} from "@/lib/http";

/**
 * Verification links are opened by mail clients and security scanners, which
 * issue GETs. Confirming here would let any such prefetch complete a
 * verification, so a GET only forwards to the confirmation page.
 */
export const GET = routeHandler(async (request: Request) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const target = new URL("/verify-email", config().APP_URL);
  if (token) target.searchParams.set("token", token);
  return Response.redirect(target, 303);
});

export const POST = routeHandler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const token = await formString(request, "token");
  const verified = token ? await verifyEmailToken(token, user.id) : null;
  return verified
    ? redirectWithMessage(
        request,
        "/settings",
        "notice",
        `${verified} is verified`,
      )
    : redirectWithMessage(
        request,
        "/settings",
        "error",
        "Verification link is invalid or expired",
      );
});
