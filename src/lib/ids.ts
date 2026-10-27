/**
 * Identifier helpers built on Web Crypto (available in browsers and Node ≥ 20).
 */

// Crockford-style alphabet without ambiguous characters (0/O, 1/I/L, U).
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomChars(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/** Human-friendly lead reference, e.g. `ASD-2609-K7QX` (prefix + YYMM + random). */
export function createLeadReference(date = new Date()): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `ASD-${yy}${mm}-${randomChars(4, REFERENCE_ALPHABET)}`;
}

/** Unguessable URL-safe token (256 bits) for client proposal links. */
export function createShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** Short random id for nested objects such as proposal line items. */
export function shortId(prefix: string): string {
  return `${prefix}_${randomChars(10, "abcdefghijkmnpqrstuvwxyz23456789")}`;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
