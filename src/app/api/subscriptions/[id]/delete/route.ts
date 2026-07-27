import { requireRouteUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const { id } = await context.params;
  await db.subscription.deleteMany({ where: { id, userId: user.id } });
  return redirectWithMessage(
    request,
    "/",
    "notice",
    "Subscription removed",
  );
}
