import "server-only";

import { config } from "@/lib/config";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new Response("Missing request origin", { status: 403 });
  }

  if (new URL(origin).origin !== new URL(config().APP_URL).origin) {
    throw new Response("Invalid request origin", { status: 403 });
  }
}

export function safeReturnTo(value: string | null, fallback = "/"): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function redirectWithMessage(
  request: Request,
  path: string,
  key: "notice" | "error",
  message: string,
): Response {
  const url = new URL(path, request.url);
  url.searchParams.set(key, message);
  return Response.redirect(url, 303);
}

export async function formString(
  request: Request,
  field: string,
): Promise<string> {
  const form = await request.formData();
  return String(form.get(field) ?? "").trim();
}
