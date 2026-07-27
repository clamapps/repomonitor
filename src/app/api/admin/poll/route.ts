import { requireRouteAdmin } from "@/lib/auth/session";
import { assertSameOrigin, redirectWithMessage } from "@/lib/http";
import { runPollingCycle } from "@/lib/polling/run";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await requireRouteAdmin();
  const result = await runPollingCycle("manual");
  if (!result.acquired) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "A poll is already running",
    );
  }
  const summary = `Polled ${result.repositories} repositories; queued ${result.notificationsQueued} match notifications and ${result.subscriptionAlertsQueued} access alerts; sent ${result.notificationsSent + result.subscriptionAlertsSent} emails${result.errors.length ? `; ${result.errors.length} errors` : ""}`;
  return redirectWithMessage(request, "/settings", "notice", summary);
}
