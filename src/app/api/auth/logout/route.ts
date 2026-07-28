import { destroySession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { assertSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await destroySession();
  return Response.redirect(new URL("/", config().APP_URL), 303);
}
