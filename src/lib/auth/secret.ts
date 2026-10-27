/**
 * Session secret resolution shared by the proxy (which must stay lightweight and
 * cannot import the full server config) and the server config itself.
 */
export const DEV_SESSION_SECRET = "dev-only-session-secret-change-me-0123456789abcdef";

export function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production (min 32 characters).");
  }
  return DEV_SESSION_SECRET;
}
