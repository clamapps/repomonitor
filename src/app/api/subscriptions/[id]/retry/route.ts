import { requireRouteUser } from "@/lib/auth/session";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";
import { retrySubscription } from "@/lib/subscriptions";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const { id } = await context.params;
  try {
    await retrySubscription(user.id, id);
    return redirectWithMessage(
      request,
      `/subscriptions/${id}`,
      "notice",
      "Repository access restored. Monitoring will resume on the next poll.",
    );
  } catch (error) {
    return redirectWithMessage(
      request,
      `/subscriptions/${id}`,
      "error",
      error instanceof Error
        ? error.message
        : "Repository access could not be restored.",
    );
  }
}
