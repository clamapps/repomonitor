import { db } from "@/lib/db";
import { requireRouteUser } from "@/lib/auth/session";
import { assertSameOrigin, redirectWithMessage, routeHandler } from "@/lib/http";
import {
  parseEventTypes,
  updateSubscriptionEvents,
} from "@/lib/subscriptions";

type Context = { params: Promise<{ id: string }> };

export const POST = routeHandler(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const { id } = await context.params;
  const form = await request.formData();
  try {
    await updateSubscriptionEvents(user.id, id, parseEventTypes(form));
    return redirectWithMessage(
      request,
      `/subscriptions/${id}`,
      "notice",
      "Event settings updated",
    );
  } catch (error) {
    return redirectWithMessage(
      request,
      `/subscriptions/${id}`,
      "error",
      error instanceof Error ? error.message : "Unable to update subscription",
    );
  }
});

export const DELETE = routeHandler(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const { id } = await context.params;
  await db.subscription.deleteMany({ where: { id, userId: user.id } });
  return Response.json({ ok: true });
});
