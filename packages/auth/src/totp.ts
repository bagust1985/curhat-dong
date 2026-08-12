import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP — RFC 6238, for admin MFA (E14-T01, TECH-SPEC §7.4).
 *
 * Written here rather than pulled from a package for the same reason the AI
 * adapters avoid vendor SDKs: this is thirty lines of well-specified
 * arithmetic sitting on the authentication path, and a dependency there is a
 * supply-chain surface for something we can read in full.
 *
 * SHA-1 is not a mistake. RFC 6238's default is HMAC-SHA1, and every
 * authenticator app (Google Authenticator, Authy, 1Password, Aegis) implements
 * that default; SHA-256 codes silently fail to match in most of them. HMAC-SHA1
 * is not affected by SHA-1's collision weaknesses — it relies on the
 * pseudorandomness of the compression function, not collision resistance.
 */

/** RFC 6238 default. Changing it breaks every already-enrolled authenticator. */
const STEP_SECONDS = 30;
const DIGITS = 6;

/**
 * How many steps either side of now are accepted.
 *
 * One step is ±30 seconds, which forgives ordinary phone clock drift and the
 * case of typing a code as it rolls over. Wider would meaningfully extend the
 * window in which an observed code still works.
 */
const DEFAULT_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648, no padding) — the encoding authenticator apps expect. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(encoded: string): Buffer {
  const normalised = encoded.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalised) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('Invalid base32 character');

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * A new TOTP secret.
 *
 * 160 bits, the size RFC 4226 recommends for HMAC-SHA1: it matches the hash
 * output, so a shorter secret would be the weakest part of the construction.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code for one time step. */
function codeForCounter(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer. It stays well inside Number's
  // 53-bit safe range until the year 275760, so the high word is written
  // separately rather than reaching for BigInt.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac('sha1', secret).update(buffer).digest();

  // Dynamic truncation (RFC 4226 §5.3): the low nibble of the last byte picks
  // where to read four bytes from, so the code depends on the whole digest.
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

export function generateTotp(secretBase32: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
  return codeForCounter(base32Decode(secretBase32), counter);
}

/**
 * Verifies a code and returns **which step it belonged to**, or null.
 *
 * The step matters as much as the yes/no. A caller preventing replay has to
 * record the step that was actually consumed — recording "the current step"
 * instead is subtly wrong, because the accepted window spans three steps: a
 * legitimate code from the next step would be filed under this one, and then
 * rejected as a replay the moment its real step came around.
 *
 * The comparison is `timingSafeEqual` rather than `===`: a code is a secret for
 * thirty seconds, and string comparison leaks how many leading digits were
 * right. Every candidate in the window is evaluated — no early return — so the
 * work does not depend on which step matched.
 */
export function verifyTotpStep(
  secretBase32: string,
  code: string,
  options: { at?: Date; window?: number } = {},
): number | null {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return null;

  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return null;
  }

  const at = options.at ?? new Date();
  const window = options.window ?? DEFAULT_WINDOW;
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);

  const supplied = Buffer.from(trimmed, 'utf8');
  let matchedStep: number | null = null;

  for (let drift = -window; drift <= window; drift += 1) {
    const step = counter + drift;
    const candidate = Buffer.from(codeForCounter(secret, step), 'utf8');
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) {
      matchedStep = step;
    }
  }

  return matchedStep;
}

/** Whether a code is valid, when the caller does not track replay. */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { at?: Date; window?: number } = {},
): boolean {
  return verifyTotpStep(secretBase32, code, options) !== null;
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The label carries the admin's identifier so somebody with several accounts
 * can tell the entries apart — but this is an admin email, not curhat, and it
 * never leaves the admin panel.
 */
export function totpUri(options: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = options.issuer ?? 'Curhat Dong Admin';
  const label = encodeURIComponent(`${issuer}:${options.accountName}`);

  const params = new URLSearchParams({
    secret: options.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * The step a code belongs to, for replay prevention.
 *
 * A TOTP code stays valid for its whole window, so a code observed over a
 * shoulder — or captured from a phishing page — can be replayed within the
 * minute. Recording the step that was consumed lets the caller refuse the
 * second use.
 */
export function totpStep(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}
