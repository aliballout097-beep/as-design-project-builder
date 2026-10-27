/**
 * Generate an ADMIN_PASSWORD_HASH value.
 *   npm run admin:hash -- "a long, unique password"
 */
import { randomBytes, scrypt } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run admin:hash -- "a password of at least 10 characters"');
  process.exit(1);
}
const salt = randomBytes(16);
scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
  if (error) throw error;
  const hash = ["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join(".");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
});
