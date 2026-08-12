import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  generateTotp,
  generateTotpSecret,
  totpStep,
  totpUri,
  verifyTotp,
} from './totp.js';

/**
 * TOTP — E14-T01, RFC 6238.
 *
 * The RFC's own test vectors are used below. Implementing TOTP that produces
 * *some* six digits is easy; implementing one that produces the digits a
 * phone's authenticator produces is the part worth proving, and getting it
 * wrong locks every admin out of the panel.
 */

/** RFC 6238 Appendix B: the ASCII secret "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32 (RFC 4648)', () => {
  it('round-trips arbitrary bytes', () => {
    for (const input of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) {
      const buffer = Buffer.from(input, 'ascii');
      expect(base32Decode(base32Encode(buffer)).equals(buffer), input).toBe(true);
    }
  });

  it('matches the published vectors', () => {
    expect(base32Encode(Buffer.from('foobar', 'ascii'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString('ascii')).toBe('foobar');
  });

  it('tolerates padding, whitespace and lower case, as apps emit them', () => {
    expect(base32Decode('mzxw 6ytb oi==').toString('ascii')).toBe('foobar');
  });

  it('rejects a character outside the alphabet', () => {
    expect(() => base32Decode('MZXW6YTB01')).toThrow();
  });
});

describe('code generation (RFC 6238 test vectors)', () => {
  // Appendix B, SHA-1 column. If these drift, real authenticator apps stop
  // agreeing with us.
  const vectors: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  for (const [seconds, expected] of vectors) {
    it(`produces ${expected} at t=${seconds}`, () => {
      expect(generateTotp(RFC_SECRET, new Date(seconds * 1000))).toBe(expected);
    });
  }

  it('always produces six digits, including leading zeros', () => {
    // "005924" above is exactly the case a naive `String(number)` drops, and
    // the bug only shows up for one code in ten.
    expect(generateTotp(RFC_SECRET, new Date(1234567890 * 1000))).toBe('005924');

    const secret = generateTotpSecret();
    for (let i = 0; i < 200; i += 1) {
      expect(generateTotp(secret, new Date(i * 31_000))).toMatch(/^\d{6}$/);
    }
  });

  it('changes every 30 seconds and not within one', () => {
    const secret = generateTotpSecret();
    // Aligned to a step boundary (1700000010 is divisible by 30). An unaligned
    // instant would put "+29s" in the next step and make this test assert the
    // opposite of what it means to.
    const base = new Date(1_700_000_010_000);

    expect(generateTotp(secret, base)).toBe(
      generateTotp(secret, new Date(base.getTime() + 29_000)),
    );
    expect(generateTotp(secret, base)).not.toBe(
      generateTotp(secret, new Date(base.getTime() + 31_000)),
    );
  });
});

describe('verification', () => {
  const secret = generateTotpSecret();
  const now = new Date(1_700_000_000_000);

  it('accepts the current code', () => {
    expect(verifyTotp(secret, generateTotp(secret, now), { at: now })).toBe(true);
  });

  it('forgives one step of clock drift in both directions', () => {
    // Phone clocks drift, and people type a code as it rolls over.
    const earlier = new Date(now.getTime() - 30_000);
    const later = new Date(now.getTime() + 30_000);

    expect(verifyTotp(secret, generateTotp(secret, earlier), { at: now })).toBe(true);
    expect(verifyTotp(secret, generateTotp(secret, later), { at: now })).toBe(true);
  });

  it('refuses a code from further away', () => {
    // Wider forgiveness meaningfully extends the window in which a code seen
    // over somebody's shoulder still works.
    const stale = new Date(now.getTime() - 120_000);
    expect(verifyTotp(secret, generateTotp(secret, stale), { at: now })).toBe(false);
  });

  it('refuses a code for a different secret', () => {
    const other = generateTotpSecret();
    expect(verifyTotp(secret, generateTotp(other, now), { at: now })).toBe(false);
  });

  it('refuses anything that is not six digits', () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 34 56', '12345a']) {
      expect(verifyTotp(secret, code, { at: now }), code).toBe(false);
    }
  });

  it('returns false rather than throwing on a corrupt secret', () => {
    // A secret that fails to decode must fail the login, not 500 it.
    expect(verifyTotp('not-base32!!', '123456', { at: now })).toBe(false);
  });

  it('tolerates surrounding whitespace, as people paste it', () => {
    expect(verifyTotp(secret, ` ${generateTotp(secret, now)} `, { at: now })).toBe(true);
  });
});

describe('secrets', () => {
  it('are 160 bits, the size RFC 4226 recommends for HMAC-SHA1', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it('are never repeated', () => {
    const secrets = new Set(Array.from({ length: 100 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(100);
  });
});

describe('enrolment URI', () => {
  const secret = generateTotpSecret();
  const uri = totpUri({ secret, accountName: 'ops@curhatdong.com' });

  it('carries the parameters an authenticator app needs', () => {
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('escapes the label', () => {
    expect(uri).not.toMatch(/totp\/[^?]*[ @]/);
  });
});

describe('replay window', () => {
  it('identifies the step a code belongs to', () => {
    // A code stays valid for its whole window, so a code captured by a
    // phishing page can be replayed within the minute. Recording the consumed
    // step is what lets the caller refuse the second use.
    const at = new Date(1_700_000_010_000);

    expect(totpStep(at)).toBe(totpStep(new Date(at.getTime() + 29_000)));
    expect(totpStep(at)).not.toBe(totpStep(new Date(at.getTime() + 31_000)));
  });
});
