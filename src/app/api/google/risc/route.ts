import {
  GoogleRiscVerificationUnavailableError,
  processGoogleRiscEvent,
  verifyGoogleRiscToken,
} from "@/lib/google/risc";

const MAX_SECURITY_EVENT_BYTES = 64 * 1024;
const SECURITY_EVENT_CONTENT_TYPE = "application/secevent+jwt";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !==
    SECURITY_EVENT_CONTENT_TYPE
  ) {
    return new Response("Unsupported media type", { status: 415 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SECURITY_EVENT_BYTES
  ) {
    return new Response("Security event token is too large", { status: 413 });
  }

  const token = await request.text();
  if (!token || Buffer.byteLength(token) > MAX_SECURITY_EVENT_BYTES) {
    return new Response("Invalid security event token", { status: 400 });
  }

  let payload;
  try {
    payload = await verifyGoogleRiscToken(token);
  } catch (error) {
    if (error instanceof GoogleRiscVerificationUnavailableError) {
      console.error("Google RISC verification is temporarily unavailable", error);
      return new Response("Security event verification unavailable", {
        status: 503,
      });
    }
    console.warn("Rejected an invalid Google RISC security event", {
      cause: error instanceof Error ? error.message : "unknown error",
    });
    return new Response("Invalid security event token", { status: 400 });
  }

  try {
    await processGoogleRiscEvent(payload);
  } catch (error) {
    console.error("Failed to process a valid Google RISC security event", error);
    return new Response("Security event processing failed", { status: 503 });
  }

  return new Response(null, { status: 202 });
}
