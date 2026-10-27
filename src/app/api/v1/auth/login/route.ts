import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { getConfig } from "@/lib/env";
import { ApiError, getClientIp, readJson, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/security";

// A well-formed hash that never matches — keeps response timing uniform for unknown emails.
const DUMMY_HASH = `scrypt.16384.8.1.${"A".repeat(22)}.${"A".repeat(86)}`;

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(500),
});

/** POST /api/v1/auth/login — exchange admin credentials for an HttpOnly session cookie. */
export const POST = route(async (request) => {
  const config = getConfig();
  await enforceRateLimit(`login:${getClientIp(request) ?? "unknown"}`, 10, 15 * 60 * 1000);
  const { email, password } = await readJson(request, LoginSchema, { maxBytes: 8 * 1024 });

  let valid = false;
  const admin = config.admins.find((user) => user.email === email);
  if (admin) valid = await verifyPassword(password, admin.passwordHash);
  else if (config.devLogin && email === config.devLogin.email) valid = safeEqual(password, config.devLogin.password);
  else await verifyPassword(password, DUMMY_HASH); // equalise timing for unknown emails

  if (!valid) throw new ApiError(401, "invalid_credentials", "Incorrect email or password");

  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(email, config.sessionSecret), sessionCookieOptions(config.isProduction));
  return response;
});
