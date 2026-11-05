import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (value) {
    if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters");
    return Buffer.from(value, "hex");
  }
  // The fallback is public (it's in the repo), so production must set its own key.
  if (process.env.NODE_ENV === "production") throw new Error("TOKEN_ENCRYPTION_KEY must be set in production");
  return createHash("sha256").update("dev-only-token-key").digest();
}

/** Encrypts a network access token for storage (AES-256-GCM). */
export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** Decrypts a stored token. Mock accounts store plain placeholders, which come back unchanged. */
export function decryptToken(stored: string | null): string | null {
  if (!stored?.startsWith(PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
