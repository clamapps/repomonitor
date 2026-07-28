import { config } from "@/lib/config";
import { verifyEmailToken } from "@/lib/email/verification";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const verified = token ? await verifyEmailToken(token) : null;
  const target = new URL("/settings", config().APP_URL);
  if (verified) {
    target.searchParams.set("notice", `${verified} is verified`);
  } else {
    target.searchParams.set("error", "Verification link is invalid or expired");
  }
  return Response.redirect(target, 303);
}
