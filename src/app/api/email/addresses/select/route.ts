import { requireRouteUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const form = await request.formData();
  const address = await db.emailAddress.findFirst({
    where: {
      id: String(form.get("emailAddressId") ?? ""),
      userId: user.id,
      verifiedAt: { not: null },
    },
  });
  if (!address) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Verified email not found",
    );
  }
  await db.user.update({
    where: { id: user.id },
    data: { notificationEmailId: address.id },
  });
  return redirectWithMessage(
    request,
    "/settings",
    "notice",
    "Notification email updated",
  );
}
