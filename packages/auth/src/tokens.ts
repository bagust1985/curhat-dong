import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Access-token issuing and verification — TECH-SPEC §5.1.
 *
 * Implemented on `node:crypto` rather than a JWT library, for one practical
 * reason: the API runs as CommonJS (NestJS + emitDecoratorMetadata), and the
 * current maintained JWT libraries are ESM-only, so they cannot be `require`d
 * from it. HS256 is a keyed hash over two base64url segments, so writing it
 * out is cheaper than reshaping the whole backend around a dependency.
 *
 * What actually makes a JWT verifier safe is not the library — it is refusing
 * the well-known attacks. All of them are handled below and covered by tests:
 *   - `alg: none`
 *   - algorithm confusion (a token asking to be checked with another alg)
 *   - a swapped payload with the original signature
 *   - a signature verified with `===` instead of a constant-time compare
 *   - missing expiry, issuer or audience checks
 *
 * TTL is 15 minutes and the payload carries the internal user id, session id
 * and role — nothing else. A JWT is base64, not encryption, so anything in the
 * payload is effectively public (CLAUDE.md non-negotiable #4).
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const ISSUER = 'curhatdong';
const AUDIENCE = 'curhatdong-app';
/** The only algorithm this application ever accepts. */
const ALGORITHM = 'HS256';
/** Tolerance for clock drift between the API and its own tokens. */
const CLOCK_SKEW_SECONDS = 5;

export interface AccessTokenClaims {
  /** Internal user id. */
  sub: string;
  /** Session id, so a revoked session can be rejected before expiry. */
  sid: string;
  /** Admin role, absent for ordinary users. */
  role?: string;
}

interface JwtPayload {
  sub: string;
  sid: string;
  role?: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type TokenVerifyFailure = 'expired' | 'invalid';

export type TokenVerifyResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: TokenVerifyFailure };

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function sign(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: ALGORITHM, typ: 'JWT' };
  const payload: JwtPayload = {
    sub: claims.sub,
    sid: claims.sid,
    ...(claims.role ? { role: claims.role } : {}),
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + ttlSeconds,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  return Promise.resolve(`${signingInput}.${sign(signingInput, secret)}`);
}

/**
 * Verifies a token.
 *
 * Expiry is reported separately from tampering because the client needs to
 * tell them apart: expired means "refresh", invalid means "log in again".
 * Collapsing both into one error forces a needless logout every 15 minutes.
 */
export function verifyAccessToken(token: string, secret: string): Promise<TokenVerifyResult> {
  return Promise.resolve(verifySync(token, secret));
}

function verifySync(token: string, secret: string): TokenVerifyResult {
  const segments = token.split('.');
  if (segments.length !== 3) return { ok: false, reason: 'invalid' };

  const [encodedHeader, encodedPayload, signature] = segments as [string, string, string];

  let header: { alg?: unknown; typ?: unknown };
  let payload: Partial<JwtPayload>;

  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as {
      alg?: unknown;
    };
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtPayload;
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  // Pinned, not read from the token. Trusting the token's own `alg` is the
  // "alg: none" and algorithm-confusion family of attacks: the attacker gets
  // to choose how their forgery is checked.
  if (header.alg !== ALGORITHM) return { ok: false, reason: 'invalid' };

  const expected = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!constantTimeEquals(signature, expected)) return { ok: false, reason: 'invalid' };

  if (payload.iss !== ISSUER || payload.aud !== AUDIENCE) {
    return { ok: false, reason: 'invalid' };
  }

  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    return { ok: false, reason: 'invalid' };
  }

  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    // A token with no expiry would be valid forever. Treat it as malformed.
    return { ok: false, reason: 'invalid' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp + CLOCK_SKEW_SECONDS < now) return { ok: false, reason: 'expired' };
  if (payload.iat - CLOCK_SKEW_SECONDS > now) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    claims: {
      sub: payload.sub,
      sid: payload.sid,
      ...(typeof payload.role === 'string' ? { role: payload.role } : {}),
    },
  };
}

/** Decodes the payload without verifying. Tests and debugging only. */
export function decodeTokenPayloadUnsafe(token: string): Record<string, unknown> {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) throw new Error('Malformed token');
  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

/**
 * Fields a JWT payload must never contain.
 *
 * Asserted by a test rather than left to review discipline — this is the kind
 * of leak that gets added in a hurry and noticed by someone else entirely.
 */
export const FORBIDDEN_TOKEN_CLAIMS = [
  'email',
  'emailHash',
  'email_hash',
  'phone',
  'providerId',
  'provider_id',
  'trustScore',
  'trust_score',
  'trustScoreInternal',
] as const;
