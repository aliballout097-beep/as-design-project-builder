import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { memoryRateLimit } from "@/lib/rate-limit";
import { hashIp, safeEqual, signPayload, verifySignature } from "@/lib/security";

const SECRET = "test-secret-test-secret-test-secret-123";

describe("security helpers", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt.16384.8.1.")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("signs and verifies sessions", async () => {
    const token = await createSessionToken("admin@asdesignlb.com", SECRET);
    expect((await verifySessionToken(token, SECRET))?.email).toBe("admin@asdesignlb.com");
    expect(await verifySessionToken(token, `${SECRET}-other`)).toBeNull();
    expect(await verifySessionToken(`${token}x`, SECRET)).toBeNull();
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
  });

  it("verifies HMAC webhook signatures with a timestamp window", () => {
    const now = 1_800_000_000;
    const body = JSON.stringify({ hello: "world" });
    const signature = signPayload(SECRET, now, body);
    expect(verifySignature({ secret: SECRET, timestamp: now, body, signature, now })).toBe(true);
    expect(verifySignature({ secret: SECRET, timestamp: now, body: body + " ", signature, now })).toBe(false);
    expect(verifySignature({ secret: SECRET, timestamp: now, body, signature, now: now + 600 })).toBe(false);
  });

  it("compares secrets safely and hashes IPs", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(hashIp("1.2.3.4", "salt")).toHaveLength(32);
    expect(hashIp(null, "salt")).toBeNull();
  });

  it("rate limits within a window", () => {
    const key = `test-${Math.random()}`;
    const results = Array.from({ length: 4 }, () => memoryRateLimit(key, 3, 60_000, 1000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(memoryRateLimit(key, 3, 60_000, 70_000).allowed).toBe(true);
  });
});
