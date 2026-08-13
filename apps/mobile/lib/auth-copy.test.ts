import { describe, expect, it } from 'vitest';

import { AUTH_ERROR_COPY, AUTH_ERROR_FALLBACK, ENUMERATION_TELLS } from '../../web/lib/auth-copy';
import { AUTH_FALLBACK, ERROR_COPY } from './auth-copy';

/**
 * The parity test the comment in `app/auth.tsx` has always promised — E16-T03.
 *
 * The copy is duplicated because the web file is a web module; duplication is
 * only acceptable while this test makes drift impossible. Byte-identical, both
 * directions: a key present on one side and missing on the other is exactly
 * the bug this exists to catch.
 */
describe('web ↔ mobile auth copy parity', () => {
  it('has identical keys and identical sentences', () => {
    expect(ERROR_COPY).toEqual({ ...AUTH_ERROR_COPY });
  });

  it('shares the fallback sentence', () => {
    expect(AUTH_FALLBACK).toBe(AUTH_ERROR_FALLBACK);
  });

  it('never says whether an email has an account (same sweep as the web)', () => {
    for (const message of [...Object.values(ERROR_COPY), AUTH_FALLBACK]) {
      for (const tell of ENUMERATION_TELLS) {
        expect(message, `${message} vs ${tell}`).not.toMatch(tell);
      }
    }
  });
});
