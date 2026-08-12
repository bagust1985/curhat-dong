import { describe, expect, it } from 'vitest';

import {
  decrypt,
  encrypt,
  generateOpaqueToken,
  generateOtpCode,
  hashEmail,
  hashIp,
  hashToken,
  safeCompare,
} from './crypto.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  FORBIDDEN_TOKEN_CLAIMS,
  decodeTokenPayloadUnsafe,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const OTHER_SECRET = 'a-completely-different-secret-also-32-chars-long';

describe('email hashing (TECH-SPEC §7.5)', () => {
  it('is deterministic for the same address', () => {
    expect(hashEmail('halo@curhatdong.com', SECRET)).toBe(hashEmail('halo@curhatdong.com', SECRET));
  });

  it('normalises case and surrounding whitespace', () => {
    expect(hashEmail('  Halo@CurhatDong.com ', SECRET)).toBe(
      hashEmail('halo@curhatdong.com', SECRET),
    );
  });

  it('differs per secret, so a leaked table alone is not a rainbow table', () => {
    expect(hashEmail('halo@curhatdong.com', SECRET)).not.toBe(
      hashEmail('halo@curhatdong.com', OTHER_SECRET),
    );
  });

  it('never contains the plaintext address', () => {
    expect(hashEmail('halo@curhatdong.com', SECRET)).not.toContain('curhatdong.com');
  });
});

describe('encryption (TECH-SPEC §7.5)', () => {
  it('round-trips', () => {
    const plaintext = 'halo@curhatdong.com';
    expect(decrypt(encrypt(plaintext, SECRET), SECRET)).toBe(plaintext);
  });

  it('produces different ciphertext each time for the same input', () => {
    // A fresh IV per call: identical ciphertext would reveal which accounts
    // share an address.
    expect(encrypt('sama', SECRET)).not.toBe(encrypt('sama', SECRET));
  });

  it('refuses to decrypt with the wrong key', () => {
    expect(() => decrypt(encrypt('rahasia', SECRET), OTHER_SECRET)).toThrow();
  });

  it('refuses tampered ciphertext', () => {
    // GCM authenticates: flipping a byte must fail loudly, not silently return
    // garbage.
    const payload = encrypt('rahasia', SECRET);
    const parts = payload.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${Buffer.from('berbeda').toString('base64url')}`;
    expect(() => decrypt(tampered, SECRET)).toThrow();
  });

  it('rejects malformed input instead of crashing oddly', () => {
    expect(() => decrypt('bukan-ciphertext', SECRET)).toThrow(/Malformed/);
  });
});

describe('OTP codes', () => {
  it('is always six digits, including leading zeros', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it('does not repeat trivially', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(150);
  });

  it('hashes to something that does not reveal the code', () => {
    const code = '123456';
    const hashed = hashToken(code, SECRET);
    expect(hashed).not.toContain(code);
    expect(hashed).toBe(hashToken(code, SECRET));
  });
});

describe('opaque tokens', () => {
  it('is URL-safe and high entropy', () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it('does not collide across many draws', () => {
    const tokens = new Set(Array.from({ length: 2000 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(2000);
  });
});

describe('safeCompare', () => {
  it('matches equal strings and rejects different ones', () => {
    expect(safeCompare('abc', 'abc')).toBe(true);
    expect(safeCompare('abc', 'abd')).toBe(false);
  });

  it('handles different lengths without throwing', () => {
    expect(safeCompare('abc', 'abcdef')).toBe(false);
  });
});

describe('IP hashing (PRD §25.2)', () => {
  it('never stores the address itself', () => {
    const hashed = hashIp('139.180.223.100', SECRET);
    expect(hashed).not.toContain('139.180');
    expect(hashed).toBe(hashIp('139.180.223.100', SECRET));
  });
});

describe('access token (TECH-SPEC §5.1)', () => {
  it('round-trips valid claims', async () => {
    const token = await signAccessToken({ sub: 'user-1', sid: 'session-1' }, SECRET);
    const result = await verifyAccessToken(token, SECRET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('user-1');
      expect(result.claims.sid).toBe('session-1');
    }
  });

  it('expires after 15 minutes', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it('reports expiry separately from tampering', async () => {
    const expired = await signAccessToken({ sub: 'u', sid: 's' }, SECRET, -10);
    const result = await verifyAccessToken(expired, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signAccessToken({ sub: 'u', sid: 's' }, OTHER_SECRET);
    const result = await verifyAccessToken(token, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('rejects a token with a swapped payload', async () => {
    const token = await signAccessToken({ sub: 'u', sid: 's' }, SECRET);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', sid: 's' })).toString('base64url');

    const result = await verifyAccessToken(`${header}.${forged}.${signature}`, SECRET);
    expect(result.ok).toBe(false);
  });

  it('carries no identifying data in the payload', async () => {
    // A JWT is base64, not encryption. Anything here is readable by anyone
    // holding the token (CLAUDE.md non-negotiable #4).
    const token = await signAccessToken({ sub: 'user-1', sid: 'session-1' }, SECRET);
    const payload = decodeTokenPayloadUnsafe(token);

    for (const forbidden of FORBIDDEN_TOKEN_CLAIMS) {
      expect(payload).not.toHaveProperty(forbidden);
    }

    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub']);
  });

  it('carries a session id so revocation works before expiry', async () => {
    // Without `sid`, a logged-out user keeps a working token for up to
    // 15 minutes.
    const token = await signAccessToken({ sub: 'u', sid: 'session-42' }, SECRET);
    const payload = decodeTokenPayloadUnsafe(token);
    expect(payload.sid).toBe('session-42');
  });
});

/**
 * The verifier is hand-written (see tokens.ts for why), so the classic JWT
 * attacks are tested explicitly rather than assumed to be handled by a library.
 */
describe('access token — attack cases', () => {
  function forge(header: object, payload: object, signature: string): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode(header)}.${encode(payload)}.${signature}`;
  }

  const validPayload = {
    sub: 'attacker',
    sid: 's',
    iss: 'curhatdong',
    aud: 'curhatdong-app',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };

  it('rejects alg: none', async () => {
    const token = forge({ alg: 'none', typ: 'JWT' }, validPayload, '');
    expect((await verifyAccessToken(token, SECRET)).ok).toBe(false);
  });

  it('rejects an empty signature with a valid-looking header', async () => {
    const token = forge({ alg: 'HS256', typ: 'JWT' }, validPayload, '');
    expect((await verifyAccessToken(token, SECRET)).ok).toBe(false);
  });

  it('rejects algorithm confusion (RS256 header)', async () => {
    // The algorithm is pinned server-side. If it were read from the token, an
    // attacker would get to choose how their forgery is checked.
    const token = forge({ alg: 'RS256', typ: 'JWT' }, validPayload, 'whatever');
    expect((await verifyAccessToken(token, SECRET)).ok).toBe(false);
  });

  it('rejects a token with no exp claim', async () => {
    // A token without expiry would be valid forever.
    const { exp: _exp, ...noExpiry } = validPayload;
    const token = forge({ alg: 'HS256', typ: 'JWT' }, noExpiry, 'sig');
    expect((await verifyAccessToken(token, SECRET)).ok).toBe(false);
  });

  it('rejects a token issued for another audience', async () => {
    const token = forge(
      { alg: 'HS256', typ: 'JWT' },
      { ...validPayload, aud: 'aplikasi-lain' },
      'sig',
    );
    expect((await verifyAccessToken(token, SECRET)).ok).toBe(false);
  });

  it('rejects a token from another issuer', async () => {
    const token = forge(
      { alg: 'HS256', typ: 'JWT' },
      { ...validPayload, iss: 'penerbit-lain' },
      'sig',
    );
    expect((await verifyAccessToken(token, SECRET)).ok).toBe(false);
  });

  it('rejects a token dated in the future', async () => {
    const token = await signAccessToken({ sub: 'u', sid: 's' }, SECRET);
    const payload = decodeTokenPayloadUnsafe(token);
    const future = forge(
      { alg: 'HS256', typ: 'JWT' },
      { ...payload, iat: Math.floor(Date.now() / 1000) + 3600 },
      token.split('.')[2] as string,
    );
    expect((await verifyAccessToken(future, SECRET)).ok).toBe(false);
  });

  it('rejects malformed tokens without throwing', async () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c.d', '...', 'not-a-token']) {
      const result = await verifyAccessToken(bad, SECRET);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a truncated signature', async () => {
    const token = await signAccessToken({ sub: 'u', sid: 's' }, SECRET);
    const [header, payload, signature] = token.split('.');
    const truncated = `${header}.${payload}.${(signature as string).slice(0, -4)}`;
    expect((await verifyAccessToken(truncated, SECRET)).ok).toBe(false);
  });
});
