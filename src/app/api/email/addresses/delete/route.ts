import { EmailSource } from "@prisma/client";

import { requireRouteUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const form = await request.formData();
  const result = await db.emailAddress.deleteMany({
    where: {
      id: String(form.get("emailAddressId") ?? ""),
      userId: user.id,
      source: EmailSource.CUSTOM,
    },
  });

  return redirectWithMessage(
    request,
    "/settings",
    result.count ? "notice" : "error",
    result.count ? "Email address removed" : "Custom email address not found",
  );
}
