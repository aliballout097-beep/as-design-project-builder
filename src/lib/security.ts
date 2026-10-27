import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison that is safe for unequal lengths. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/**
 * HMAC-SHA256 signature over `${timestamp}.${body}` — the scheme used for every
 * outbound webhook to n8n (`X-ASD-Signature: sha256=<hex>`, `X-ASD-Timestamp`).
 */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifySignature(params: {
  secret: string;
  timestamp: number;
  body: string;
  signature: string;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.timestamp)) return false;
  if (Math.abs(now - params.timestamp) > (params.toleranceSeconds ?? 300)) return false;
  return safeEqual(signPayload(params.secret, params.timestamp, params.body), params.signature);
}

/** One-way, salted IP hash — lets us rate-limit & dedupe without storing raw IPs. */
export function hashIp(ip: string | null, salt: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Extract a bearer token from an Authorization header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}
