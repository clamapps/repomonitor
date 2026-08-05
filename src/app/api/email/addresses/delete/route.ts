import { EmailSource } from "@prisma/client";

import { requireRouteUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, redirectWithMessage, routeHandler } from "@/lib/http";

export const POST = routeHandler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const form = await request.formData();
  const emailAddressId = String(form.get("emailAddressId") ?? "");
  const wasSelected = user.notificationEmailId === emailAddressId;
  const result = await db.emailAddress.deleteMany({
    where: {
      id: emailAddressId,
      userId: user.id,
      source: EmailSource.CUSTOM,
    },
  });

  if (!result.count) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Custom email address not found",
    );
  }
  return redirectWithMessage(
    request,
    "/settings",
    wasSelected ? "error" : "notice",
    wasSelected
      ? "Email address removed. Select another verified address — notifications are held until you do."
      : "Email address removed",
  );
});
