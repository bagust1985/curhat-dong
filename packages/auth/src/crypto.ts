import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cryptographic primitives for identity data — TECH-SPEC §7.5.
 *
 * Two distinct jobs, deliberately not conflated:
 *   - hashing, for lookup and verification (one-way, deterministic)
 *   - encryption, for data we must be able to read back (two-way)
 *
 * Email needs both: a hash to find an account without storing the address in
 * the clear, and ciphertext so support can contact a user when policy allows.
 */

const AES_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function deriveKey(secret: string, salt: string): Buffer {
  return scryptSync(secret, salt, 32);
}

/**
 * Deterministic keyed hash for lookup and dedup.
 *
 * HMAC rather than a bare digest: a plain SHA-256 of an email is trivially
 * reversible with a wordlist, since the input space of real addresses is small.
 * The key turns that into an attack that also requires the secret.
 */
export function hashEmail(email: string, secret: string): string {
  const normalised = email.trim().toLowerCase();
  return createHmac('sha256', secret).update(normalised).digest('hex');
}

/**
 * Hash for refresh tokens and OTP codes.
 *
 * These are already high-entropy random values, so a keyed HMAC is sufficient
 * and constant-time to verify — no need for a slow password KDF here.
 */
export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

/** Constant-time comparison. Never compare secrets with `===`. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * AES-256-GCM. Output: iv:authTag:ciphertext, all base64url.
 *
 * The key is derived from a secret held outside the database (TECH-SPEC §7.5),
 * so a database dump alone does not yield plaintext.
 */
export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(secret, 'curhat-dong-encryption');
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decrypt(payload: string, secret: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext');
  }

  const [ivPart, tagPart, dataPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(tagPart, 'base64url');
  const ciphertext = Buffer.from(dataPart, 'base64url');

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Malformed ciphertext');
  }

  const key = deriveKey(secret, 'curhat-dong-encryption');
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Six-digit OTP.
 *
 * `randomInt` is CSPRNG-backed; `Math.random()` here would make codes
 * predictable from a handful of observed values.
 */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 256 bits of entropy, URL-safe. Used for refresh tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Random family id for a refresh-token rotation chain. */
export function generateTokenFamilyId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * IP hash for audit and abuse signals.
 *
 * Stored hashed because a raw IP is personal data under UU PDP (PRD §25.2) and
 * we only ever need equality, never the address itself.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}
