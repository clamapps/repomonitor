import { requireRouteUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";

type Context = {
  params: Promise<{ id: string; conditionId: string }>;
};

export async function POST(request: Request, context: Context) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const { id, conditionId } = await context.params;
  await db.condition.deleteMany({
    where: {
      id: conditionId,
      subscriptionEvent: { subscriptionId: id, subscription: { userId: user.id } },
    },
  });
  return redirectWithMessage(
    request,
    `/subscriptions/${id}`,
    "notice",
    "Condition removed",
  );
}
