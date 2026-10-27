import { jwtVerify, SignJWT } from "jose";
import { resolveSessionSecret } from "./secret";

/**
 * Stateless admin sessions: an HS256 JWT in an HttpOnly cookie.
 * Imported by `src/proxy.ts`, so it must not depend on server-only modules.
 */

export const SESSION_COOKIE = "asd_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface AdminSession {
  email: string;
  role: "admin";
  expiresAt: number;
}

function key(secret?: string): Uint8Array {
  return new TextEncoder().encode(secret ?? resolveSessionSecret());
}

export async function createSessionToken(email: string, secret?: string): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setIssuer("asd-automation")
    .setAudience("asd-admin")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string | undefined | null, secret?: string): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: "asd-automation",
      audience: "asd-admin",
    });
    if (payload.role !== "admin" || typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    return { email: payload.sub, role: "admin", expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
