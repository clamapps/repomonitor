import "server-only";

import { config } from "@/lib/config";

/**
 * Thrown by route guards. Next.js only converts redirect and access-fallback
 * errors into responses, so a thrown `Response` would surface as a 500;
 * `routeHandler` turns these into the intended status instead.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly redirectTo?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function routeHandler<Context>(
  handler: (request: Request, context: Context) => Response | Promise<Response>,
): (request: Request, context?: Context) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context as Context);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      if (error.redirectTo) {
        const target = new URL(error.redirectTo, config().APP_URL);
        target.searchParams.set("error", error.message);
        return Response.redirect(target, 303);
      }
      return new Response(error.message, {
        status: error.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  };
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new HttpError(403, "Missing request origin");
  }

  const requestOrigin = originOf(origin);
  if (!requestOrigin || requestOrigin !== new URL(config().APP_URL).origin) {
    throw new HttpError(403, "Invalid request origin");
  }
}

export function safeReturnTo(value: string | null, fallback = "/"): string {
  if (!value?.startsWith("/")) return fallback;
  // A backslash is normalized to a forward slash by the URL parser, so
  // "/\evil.com" would otherwise resolve to an off-site origin.
  if (/^[/\\]/.test(value.slice(1))) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}

export function redirectWithMessage(
  _request: Request,
  path: string,
  key: "notice" | "error",
  message: string,
): Response {
  const url = new URL(path, config().APP_URL);
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
