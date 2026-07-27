import { requireRouteAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clearGoogleAccessTokenCache } from "@/lib/email/sender";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

export async function POST(request: Request) {
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
}
