import { ZodError } from "zod";

import { requireRouteUser } from "@/lib/auth/session";
import { GitHubApiError } from "@/lib/github/client";
import { assertSameOrigin, redirectWithMessage, routeHandler } from "@/lib/http";
import { createSubscription, parseEventTypes } from "@/lib/subscriptions";

function errorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Invalid subscription";
  }
  if (error instanceof GitHubApiError && error.status === 404) {
    return "Repository not found or unavailable to your account";
  }
  return error instanceof Error ? error.message : "Unable to add repository";
}

export const POST = routeHandler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const form = await request.formData();
  try {
    const subscriptionId = await createSubscription(
      user.id,
      String(form.get("repository") ?? ""),
      parseEventTypes(form),
    );
    return redirectWithMessage(
      request,
      `/subscriptions/${subscriptionId}`,
      "notice",
      "Repository subscribed",
    );
  } catch (error) {
    return redirectWithMessage(request, "/", "error", errorMessage(error));
  }
});
