import "server-only";
import { getConfig } from "@/lib/env";
import { ApiError } from "@/lib/http";

/**
 * Fixed-window rate limiter.
 *
 * Uses Upstash Redis (REST, no SDK needed) when UPSTASH_REDIS_REST_URL/TOKEN are
 * set — shared across all instances — and falls back to per-process memory.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const MEMORY_KEY = Symbol.for("asd.rateLimit.memory");
type GlobalWithBuckets = typeof globalThis & { [MEMORY_KEY]?: Map<string, { count: number; resetAt: number }> };

function memoryBuckets() {
  const g = globalThis as GlobalWithBuckets;
  g[MEMORY_KEY] ??= new Map();
  return g[MEMORY_KEY];
}

export function memoryRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const buckets = memoryBuckets();
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

async function upstashRateLimit(
  upstash: { url: string; token: string },
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const redisKey = `asd:rl:${key}:${windowStart}`;
  const response = await fetch(`${upstash.url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${upstash.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PEXPIRE", redisKey, String(windowMs), "NX"],
    ]),
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
  const [incr] = (await response.json()) as [{ result: number }];
  const count = Number(incr?.result ?? 1);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: windowStart + windowMs };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const { upstash } = getConfig();
  if (upstash) {
    try {
      return await upstashRateLimit(upstash, key, limit, windowMs);
    } catch (error) {
      console.warn("[rate-limit] Upstash unavailable, falling back to memory", error);
    }
  }
  return memoryRateLimit(key, limit, windowMs);
}

/** Throws a 429 ApiError (with Retry-After) when the limit is exceeded. */
export async function enforceRateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const result = await rateLimit(key, limit, windowMs);
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    throw new ApiError(429, "rate_limited", "Too many requests — please wait a moment and try again.", undefined, {
      "Retry-After": String(retryAfter),
    });
  }
}
