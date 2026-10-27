import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/env";
import { ApiError } from "@/lib/http";
import { bearerToken, safeEqual } from "@/lib/security";
import { SESSION_COOKIE, verifySessionToken, type AdminSession } from "./session";

export type Principal = { kind: "admin"; email: string } | { kind: "n8n" };

/** Session of the signed-in admin (server components / route handlers). */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value, getConfig().sessionSecret);
  if (!session) return null;
  // Revoke sessions for admins removed from the configuration.
  const { admins, devLogin } = getConfig();
  const known = admins.some((admin) => admin.email === session.email) || devLogin?.email === session.email;
  return known ? session : null;
}

/** For admin pages: returns the session or redirects to the login screen. */
export async function requireAdminPage(nextPath = "/admin"): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients and same-origin navigations may omit it.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host || origin === getConfig().appUrl;
  } catch {
    return false;
  }
}

/**
 * Authorise an API request as an admin (session cookie) and/or n8n (bearer
 * `N8N_CALLBACK_SECRET`). Throws 401/403 `ApiError`s.
 */
export async function authorize(request: Request, allow: Array<Principal["kind"]>): Promise<Principal> {
  const config = getConfig();

  const token = bearerToken(request);
  if (token && allow.includes("n8n")) {
    if (config.n8n.callbackSecret && safeEqual(token, config.n8n.callbackSecret)) return { kind: "n8n" };
    throw new ApiError(401, "invalid_token", "Invalid API token");
  }

  if (allow.includes("admin")) {
    const session = await getAdminSession();
    if (session) {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
      if (mutating && !isSameOrigin(request)) {
        throw new ApiError(403, "cross_origin", "Cross-origin admin requests are not allowed");
      }
      return { kind: "admin", email: session.email };
    }
  }

  throw new ApiError(401, "unauthorized", "Authentication required");
}

export function actorOf(principal: Principal): string {
  return principal.kind === "admin" ? `admin:${principal.email}` : "n8n";
}
