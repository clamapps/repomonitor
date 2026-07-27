import { destroySession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await destroySession();
  return Response.redirect(new URL("/", request.url), 303);
}
