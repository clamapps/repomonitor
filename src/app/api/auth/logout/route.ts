import { destroySession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { assertSameOrigin, routeHandler } from "@/lib/http";

export const POST = routeHandler(async (request: Request) => {
  assertSameOrigin(request);
  await destroySession();
  return Response.redirect(new URL("/", config().APP_URL), 303);
});
