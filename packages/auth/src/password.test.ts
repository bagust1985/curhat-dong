import { randomBytes, scryptSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DUMMY_PASSWORD_HASH_PROMISE,
  burnPasswordVerification,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password.js';

/**
 * Password KDF — Revisi 1 (Aug 2026).
 *
 * These run the real parameters (N=32768), not toy ones: the maxmem trap —
 * Node's default is exactly the memory these parameters need, so scrypt throws
 * unless it is raised — only fires at real cost. A test with N=1024 would pass
 * while production logins crash.
 */
describe('hashPassword / verifyPassword', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword('kata-sandi-yang-benar');
    expect(await verifyPassword('kata-sandi-yang-benar', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('kata-sandi-yang-benar');
    expect(await verifyPassword('kata-sandi-yang-salah', stored)).toBe(false);
  });

  it('salts freshly: two hashes of the same password differ', async () => {
    const [a, b] = await Promise.all([hashPassword('sama persis'), hashPassword('sama persis')]);
    expect(a).not.toBe(b);
    // ...and both still verify.
    expect(await verifyPassword('sama persis', a)).toBe(true);
    expect(await verifyPassword('sama persis', b)).toBe(true);
  });

  it('stores the documented self-describing format', async () => {
    const stored = await hashPassword('apa saja');
    expect(stored).toMatch(/^scrypt-v1\$N=32768,r=8,p=1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it('verifies a hash recorded with older (valid) parameters', async () => {
    // Simulates the state after a future cost raise: rows hashed at N=16384
    // must keep verifying with their own recorded params. Built by hand here
    // because the module (correctly) only ever *writes* current params.
    const salt = randomBytes(16);
    const derived = scryptSync('parameter lama', salt, 32, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const legacy = [
      'scrypt-v1',
      'N=16384,r=8,p=1',
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
    expect(await verifyPassword('parameter lama', legacy)).toBe(true);
    // ...while tampering with the params of an existing hash fails closed.
    const tampered = (await hashPassword('pindah parameter')).replace('N=32768', 'N=16384');
    expect(await verifyPassword('pindah parameter', tampered)).toBe(false);
  });

  it('handles unicode and 128-character passwords', async () => {
    const long = 'x'.repeat(128);
    const unicode = 'kata sandi 🤍 dengan émoji';
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
    expect(await verifyPassword(unicode, await hashPassword(unicode))).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['garbage', 'bukan-hash'],
    ['wrong version', 'bcrypt-v1$N=32768,r=8,p=1$aaaa$bbbb'],
    ['missing segment', 'scrypt-v1$N=32768,r=8,p=1$aaaa'],
    ['absurd N (memory bomb)', 'scrypt-v1$N=1073741824,r=8,p=1$aaaa$bbbb'],
    ['non-numeric params', 'scrypt-v1$N=abc,r=8,p=1$aaaa$bbbb'],
  ])('returns false without throwing on %s', async (_label, stored) => {
    expect(await verifyPassword('apa saja', stored)).toBe(false);
  });
});

describe('needsRehash', () => {
  it('is false for a hash at current parameters', async () => {
    expect(needsRehash(await hashPassword('masih segar'))).toBe(false);
  });

  it('is true for weaker parameters, unknown versions and garbage', () => {
    expect(needsRehash('scrypt-v1$N=16384,r=8,p=1$aaaa$bbbb')).toBe(true);
    expect(needsRehash('scrypt-v0$N=32768,r=8,p=1$aaaa$bbbb')).toBe(true);
    expect(needsRehash('bukan-hash')).toBe(true);
  });
});

describe('dummy verification (timing anti-enumeration)', () => {
  it('the dummy hash never verifies any input', async () => {
    const dummy = await DUMMY_PASSWORD_HASH_PROMISE;
    expect(await verifyPassword('', dummy)).toBe(false);
    expect(await verifyPassword('password', dummy)).toBe(false);
    expect(await verifyPassword(dummy, dummy)).toBe(false);
  });

  it('burnPasswordVerification always returns false', async () => {
    expect(await burnPasswordVerification('apa pun isinya')).toBe(false);
  });
});
