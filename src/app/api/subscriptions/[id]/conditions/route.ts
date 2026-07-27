import { ConditionType, EventType } from "@prisma/client";
import { ZodError } from "zod";

import { requireRouteUser } from "@/lib/auth/session";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";
import { addCondition } from "@/lib/subscriptions";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  assertSameOrigin(request);
  const user = await requireRouteUser();
  const { id } = await context.params;
  const form = await request.formData();

  try {
    const eventType = String(form.get("eventType")) as EventType;
    const conditionType = String(form.get("conditionType")) as ConditionType;
    if (!Object.values(EventType).includes(eventType)) {
      throw new Error("Invalid event type");
    }
    if (!Object.values(ConditionType).includes(conditionType)) {
      throw new Error("Invalid condition type");
    }
    await addCondition(user.id, id, eventType, conditionType, {
      textPattern: String(form.get("textPattern") ?? ""),
      filePath: String(form.get("filePath") ?? ""),
      lineNumber: String(form.get("lineNumber") ?? ""),
    });
    return redirectWithMessage(
      request,
      `/subscriptions/${id}`,
      "notice",
      "Condition added",
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? "Invalid condition")
        : error instanceof Error
          ? error.message
          : "Unable to add condition";
    return redirectWithMessage(
      request,
      `/subscriptions/${id}`,
      "error",
      message,
    );
  }
}
