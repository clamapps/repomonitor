import { requireRouteAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clearGoogleAccessTokenCache } from "@/lib/email/sender";
import { assertSameOrigin, redirectWithMessage, routeHandler } from "@/lib/http";

export const POST = routeHandler(async (request: Request) => {
  assertSameOrigin(request);
  await requireRouteAdmin();
  await db.gmailSender.deleteMany({ where: { id: "global" } });
  clearGoogleAccessTokenCache();
  return redirectWithMessage(
    request,
    "/settings",
    "notice",
    "Google sender removed; sendmail is active",
  );
});
