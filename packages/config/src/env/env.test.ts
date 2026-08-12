import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from './parse.js';
import { clientEnvSchema, serverEnvSchema } from './schema.js';

const VALID_SERVER: Record<string, string> = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:3001',
  ADMIN_URL: 'http://localhost:3002',
  DATABASE_URL: 'postgresql://curhat:curhat@localhost:5432/curhat_dong',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  TOKEN_ENCRYPTION_KEY: 'c'.repeat(32),
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  EMAIL_PROVIDER: 'console',
  EMAIL_FROM: 'halo@curhatdong.com',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'auto',
  S3_BUCKET: 'curhat-dong-dev',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  AI_DEFAULT_PROVIDER: 'anthropic',
  AI_DAILY_BUDGET: '10',
};

const VALID_CLIENT: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_API_URL: 'http://localhost:3001',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-key',
};

describe('server env', () => {
  it('accepts a complete configuration', () => {
    const env = parseEnv('server', serverEnvSchema, VALID_SERVER);
    expect(env.NODE_ENV).toBe('test');
    expect(env.AI_DAILY_BUDGET).toBe(10);
  });

  it('names the missing variable instead of throwing a stack trace', () => {
    const { DATABASE_URL: _omitted, ...incomplete } = VALID_SERVER;

    expect(() => parseEnv('server', serverEnvSchema, incomplete)).toThrowError(EnvValidationError);

    try {
      parseEnv('server', serverEnvSchema, incomplete);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.join('\n')).toContain('DATABASE_URL');
    }
  });

  it('rejects a secret that is too short to be worth having', () => {
    expect(() =>
      parseEnv('server', serverEnvSchema, { ...VALID_SERVER, JWT_ACCESS_SECRET: 'short' }),
    ).toThrowError(/JWT_ACCESS_SECRET/);
  });

  it('rejects a DATABASE_URL that is not postgres', () => {
    expect(() =>
      parseEnv('server', serverEnvSchema, { ...VALID_SERVER, DATABASE_URL: 'mysql://x' }),
    ).toThrowError(/DATABASE_URL/);
  });

  it('never echoes the offending value back in the error', () => {
    const leak = 'super-secret-value-that-must-not-appear';
    try {
      parseEnv('server', serverEnvSchema, { ...VALID_SERVER, APP_URL: leak });
      expect.unreachable('expected validation to fail');
    } catch (error) {
      expect((error as Error).message).not.toContain(leak);
    }
  });
});

describe('client env', () => {
  it('accepts a complete configuration', () => {
    const env = parseEnv('client', clientEnvSchema, VALID_CLIENT);
    expect(env.NEXT_PUBLIC_API_URL).toBe('http://localhost:3001');
  });

  it('shares no keys with the server schema', () => {
    // The split is the guarantee that a secret cannot be marked public by
    // accident (TECH-SPEC §7.2). If these ever overlap, the guarantee is gone.
    const serverKeys = new Set(Object.keys(serverEnvSchema.shape));
    const clientKeys = Object.keys(clientEnvSchema.shape);

    expect(clientKeys.filter((key) => serverKeys.has(key))).toEqual([]);
  });

  it('exposes only NEXT_PUBLIC_ prefixed keys', () => {
    for (const key of Object.keys(clientEnvSchema.shape)) {
      expect(key.startsWith('NEXT_PUBLIC_')).toBe(true);
    }
  });

  it('does not expose the Turnstile secret key', () => {
    expect(Object.keys(clientEnvSchema.shape)).not.toContain('TURNSTILE_SECRET_KEY');
  });
});
