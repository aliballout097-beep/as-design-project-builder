import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { getConfig } from "@/lib/env";
import { route } from "@/lib/http";

/** POST /api/v1/auth/logout — clear the admin session cookie. */
export const POST = route(async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(getConfig().isProduction), maxAge: 0 });
  return response;
});
