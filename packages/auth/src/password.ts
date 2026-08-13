import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing — Revisi 1 (Aug 2026).
 *
 * `hashToken` next door is HMAC-SHA256 and says in its own comment that it is
 * only sufficient because refresh tokens and OTP codes are high-entropy random
 * values. Passwords are the opposite — low-entropy, human-chosen, reused across
 * sites — so they get a memory-hard KDF. This file is the one place in the
 * codebase allowed to hash a password.
 *
 * scrypt from node:crypto, no bcrypt/argon2: the package has zero runtime
 * dependencies on purpose (the JWT next door is hand-rolled for the same
 * reason), and both alternatives are native modules that would complicate the
 * Docker build for no security we do not already get from scrypt at these
 * parameters.
 *
 * Everything here is **async** scrypt, never `scryptSync`. This runs on the
 * login request path; a sync KDF blocks the event loop for the better part of
 * 100ms per attempt, which turns a burst of bad logins into an outage for
 * everyone else — a self-inflicted DoS. (`crypto.ts` uses `scryptSync` for AES
 * key derivation, which is fine there: fixed input, cached by usage pattern,
 * not attacker-paced.)
 */

/**
 * Stored format, self-describing so parameters can be raised later without a
 * migration — old hashes verify with their own recorded parameters and get
 * re-hashed on the next successful login (`needsRehash`):
 *
 *   scrypt-v1$N=32768,r=8,p=1$<salt base64url>$<hash base64url>
 */
const VERSION = 'scrypt-v1';

/** 2^15. With r=8 this needs 32MiB of memory per hash — see `maxmem` below. */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

/**
 * Node's default maxmem is 32MiB, which is *exactly* the 128·N·r requirement
 * of these parameters — scrypt throws when the limit is merely met, not
 * comfortably above. 64MiB gives headroom and room to raise N one notch
 * without rediscovering this constant the hard way.
 */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function deriveAsync(
  password: string,
  salt: Buffer,
  params: ScryptParams,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

function formatParams(params: ScryptParams): string {
  return `N=${params.N},r=${params.r},p=${params.p}`;
}

function parseParams(serialized: string): ScryptParams | null {
  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(serialized);
  if (!match) return null;
  const [, n, r, p] = match;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  // Reject parameters that are absurd in either direction: a tampered row
  // demanding N=2^30 would otherwise turn verification into a memory bomb.
  if (params.N < 16384 || params.N > 65536) return null;
  if (params.r < 1 || params.r > 16) return null;
  if (params.p < 1 || params.p > 4) return null;
  return params;
}

/** Hash a password for storage. Each call salts freshly — never deduplicate. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const params: ScryptParams = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
  const derived = await deriveAsync(password, salt, params, KEY_LENGTH);
  return [
    VERSION,
    formatParams(params),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Verify a password against a stored hash.
 *
 * Returns `false` — never throws — on malformed or unknown-version input.
 * A corrupted row must read as "wrong password", not as a 500 that tells the
 * caller something interesting happened.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [version, paramsPart, saltPart, hashPart] = parts as [string, string, string, string];
  if (version !== VERSION) return false;

  const params = parseParams(paramsPart);
  if (!params) return false;

  const salt = Buffer.from(saltPart, 'base64url');
  const expected = Buffer.from(hashPart, 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await deriveAsync(password, salt, params, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when the stored hash uses weaker parameters than the current defaults —
 * re-hash on the next successful login, the only moment the plaintext exists. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== VERSION) return true;
  const params = parseParams(parts[1] as string);
  if (!params) return true;
  return params.N < SCRYPT_N || params.r < SCRYPT_R || params.p < SCRYPT_P;
}

/**
 * A hash of a random value nobody knows, for burning identical scrypt work on
 * accounts that do not exist or have no password. Without it, "unknown email"
 * answers in microseconds while "wrong password" takes a KDF's worth of time —
 * a timing oracle that undoes the shared error code.
 *
 * Built once at module load; by the time a request needs it, the promise has
 * long resolved.
 */
export const DUMMY_PASSWORD_HASH_PROMISE: Promise<string> = hashPassword(
  randomBytes(32).toString('base64url'),
);

/**
 * Spend the same KDF cost a real verification would, then say no.
 *
 * Call this on the "account not found / has no password" branch so both
 * failure branches cost the same wall-clock time.
 */
export async function burnPasswordVerification(password: string): Promise<false> {
  await verifyPassword(password, await DUMMY_PASSWORD_HASH_PROMISE);
  return false;
}
