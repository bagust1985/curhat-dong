import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { hashEmail } from '@curhat/auth';
import type { PrismaClient } from '@curhat/database';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ResponseInterceptor } from '../../common/response.interceptor.js';
import { ENV } from '../../config/env.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SessionService } from './session.service.js';

config({ path: join(process.cwd(), '../../.env') });

/**
 * Auth security suite — E03-T12.
 *
 * Runs against a real application and a real database. Each case here maps to
 * a way the auth flow can fail open; mocking them out would test the mocks.
 */
const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeAuth = hasDatabase ? describe : describe.skip;

describeAuth('auth security', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: {
    status: string;
    keys: (p: string) => Promise<string[]>;
    del: (...k: string[]) => Promise<number>;
    once: (event: string, listener: () => void) => unknown;
  };
  let http: ReturnType<typeof request>;

  /**
   * Clears the abuse counters between cases.
   *
   * Every request in this file comes from the same loopback address, so the
   * anomaly detector correctly starts demanding Turnstile part-way through.
   * That is the feature working; the counters just need resetting so each case
   * exercises what it is actually about.
   */
  async function resetAbuseCounters(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:attempts:*')),
      ...(await redis.keys('ratelimit:otp:*')),
      ...(await redis.keys('ratelimit:password:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }

  const email = `uji-${Date.now()}@curhatdong.test`;
  const createdUserIds: string[] = [];

  /** Reads the OTP straight from the database — the console provider only logs it. */
  async function latestOtpCodeFor(address: string): Promise<string> {
    const env = app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV);
    const emailHash = hashEmail(address, env.TOKEN_ENCRYPTION_KEY);

    const challenge = await prisma.otpChallenge.findFirstOrThrow({
      where: { emailHash },
      orderBy: { createdAt: 'desc' },
    });

    // Brute-force the 6-digit space against the stored hash: the test needs the
    // plaintext code, and not storing it is exactly the property under test.
    const { hashToken } = await import('@curhat/auth');
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = i.toString().padStart(6, '0');
      if (hashToken(candidate, env.TOKEN_ENCRYPTION_KEY) === challenge.codeHash) return candidate;
    }
    throw new Error('OTP code not recoverable');
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use(cookieParser());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalGuards(
      new JwtAuthGuard(app.get(ENV), app.get(Reflector), app.get(SessionService)),
    );

    await app.init();

    prisma = app.get<PrismaClient>(PRISMA);
    redis = app.get(REDIS);
    http = request(app.getHttpServer());

    // The client runs with enableOfflineQueue disabled so rate limiting fails
    // loudly rather than silently buffering. That means commands issued before
    // the socket is ready throw, so wait for it here.
    if (redis.status !== 'ready') {
      await new Promise<void>((resolveReady) => redis.once('ready', resolveReady));
    }
  }, 60_000);

  beforeEach(async () => {
    await resetAbuseCounters();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function login(): Promise<{ accessToken: string; refreshToken: string }> {
    await resetAbuseCounters();
    await http.post('/v1/auth/otp/request').send({ email }).expect(202);
    const code = await latestOtpCodeFor(email);

    const response = await http
      .post('/v1/auth/otp/verify')
      .set('x-client-platform', 'mobile')
      .send({ email, code })
      .expect(201);

    const userId = await prisma.authAccount
      .findFirstOrThrow({
        where: { emailHash: hashEmail(email, app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV).TOKEN_ENCRYPTION_KEY) },
        select: { userId: true },
      })
      .then((row) => row.userId);

    if (!createdUserIds.includes(userId)) createdUserIds.push(userId);

    return response.body.data;
  }

  describe('OTP (TECH-SPEC §3.1)', () => {
    it('answers identically for an unknown address', async () => {
      // Otherwise this endpoint is an account-existence oracle, and on this
      // platform having an account is itself sensitive.
      const unknown = await http
        .post('/v1/auth/otp/request')
        .send({ email: `tidak-ada-${Date.now()}@curhatdong.test` })
        .expect(202);

      const known = await http.post('/v1/auth/otp/request').send({ email }).expect(202);

      expect(unknown.body).toEqual(known.body);
    });

    it('never stores the code in plaintext', async () => {
      await resetAbuseCounters();
      await http.post('/v1/auth/otp/request').send({ email }).expect(202);
      const code = await latestOtpCodeFor(email);

      const challenge = await prisma.otpChallenge.findFirstOrThrow({
        where: { emailHash: hashEmail(email, app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV).TOKEN_ENCRYPTION_KEY) },
        orderBy: { createdAt: 'desc' },
      });

      expect(challenge.codeHash).not.toBe(code);
      expect(JSON.stringify(challenge)).not.toContain(code);
    });

    it('rejects a wrong code with a stable error code', async () => {
      await http.post('/v1/auth/otp/request').send({ email }).expect(202);

      const response = await http
        .post('/v1/auth/otp/verify')
        .send({ email, code: '000000' });

      expect(response.status).toBe(400);
      expect(['AUTH_OTP_INVALID', 'AUTH_OTP_TOO_MANY_ATTEMPTS']).toContain(
        response.body.error.code,
      );
    });

    it('refuses to reuse a consumed code', async () => {
      await resetAbuseCounters();
      await http.post('/v1/auth/otp/request').send({ email }).expect(202);
      const code = await latestOtpCodeFor(email);

      await http.post('/v1/auth/otp/verify').send({ email, code }).expect(201);

      const second = await http.post('/v1/auth/otp/verify').send({ email, code });
      expect(second.status).toBe(400);
    });
  });

  describe('refresh rotation (TECH-SPEC §5.1)', () => {
    it('invalidates the old token after a rotation', async () => {
      const tokens = await login();

      await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: tokens.refreshToken })
        .expect(201);

      const replay = await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: tokens.refreshToken });

      expect(replay.status).toBe(401);
    });

    it('revokes the entire family when a rotated token is replayed', async () => {
      // A replayed token may be stolen or merely stale, and there is no way to
      // tell. Revoking the family is the only safe reading.
      const tokens = await login();

      const rotated = await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: tokens.refreshToken })
        .expect(201);

      await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);

      // The token minted by the legitimate rotation must be dead too.
      const afterFamilyRevoke = await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: rotated.body.data.refreshToken });

      expect(afterFamilyRevoke.status).toBe(401);
      expect(afterFamilyRevoke.body.error.code).toBe('AUTH_REFRESH_REUSE_DETECTED');
    });

    it('stores refresh tokens hashed', async () => {
      const tokens = await login();

      const stored = await prisma.userSession.findMany({
        select: { refreshTokenHash: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      for (const session of stored) {
        expect(session.refreshTokenHash).not.toBe(tokens.refreshToken);
      }
    });
  });

  describe('token storage (TECH-SPEC §5.1)', () => {
    it('withholds the refresh token from the body for browser clients', async () => {
      // A browser has nowhere safe to keep it; localStorage is explicitly
      // forbidden. It goes into an HttpOnly cookie instead.
      await resetAbuseCounters();
      await http.post('/v1/auth/otp/request').send({ email }).expect(202);
      const code = await latestOtpCodeFor(email);

      const response = await http.post('/v1/auth/otp/verify').send({ email, code }).expect(201);

      expect(response.body.data.refreshToken).toBeUndefined();

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find((c) => c.startsWith('curhat_refresh='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('SameSite=Lax');
    });

    it('returns the refresh token in the body for mobile clients', async () => {
      const tokens = await login();
      expect(typeof tokens.refreshToken).toBe('string');
    });
  });

  describe('session revocation', () => {
    it('rejects an access token whose session was revoked, before it expires', async () => {
      // Without a session check the token keeps working for 15 minutes after
      // logout.
      const tokens = await login();

      await http
        .get('/v1/me')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .expect((res) => expect([200, 404]).toContain(res.status));

      await http
        .post('/v1/auth/logout')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      const afterLogout = await http
        .get('/v1/me')
        .set('authorization', `Bearer ${tokens.accessToken}`);

      expect(afterLogout.status).toBe(401);
    });

    it('logout-all kills sessions on every device', async () => {
      const first = await login();
      const second = await login();

      await http
        .post('/v1/auth/logout-all')
        .set('authorization', `Bearer ${second.accessToken}`)
        .expect(200);

      const firstAfter = await http
        .get('/v1/me')
        .set('authorization', `Bearer ${first.accessToken}`);

      expect(firstAfter.status).toBe(401);
    });
  });

  describe('guard defaults', () => {
    it('protects endpoints that did not opt out', async () => {
      // Authentication is on by default; a route opts out with @Public().
      // The reverse is how an endpoint ships unprotected.
      await http.get('/v1/me').expect(401);
      await http.get('/v1/me/blocked').expect(401);
    });

    it('rejects a forged bearer token', async () => {
      await http.get('/v1/me').set('authorization', 'Bearer not.a.token').expect(401);
    });
  });

  describe('Google login (TECH-SPEC §5.3)', () => {
    it('rejects an unverified ID token', async () => {
      // The client never decides who it is; the token is checked server-side.
      const response = await http.post('/v1/auth/google').send({ idToken: 'a.b.c' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_GOOGLE_TOKEN_INVALID');
    });
  });

  describe('PII exposure (CLAUDE.md non-negotiable #4)', () => {
    it('never returns email, provider id or trust score from an auth response', async () => {
      await resetAbuseCounters();
      await http.post('/v1/auth/otp/request').send({ email }).expect(202);
      const code = await latestOtpCodeFor(email);

      const response = await http
        .post('/v1/auth/otp/verify')
        .set('x-client-platform', 'mobile')
        .send({ email, code })
        .expect(201);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain(email);
      for (const forbidden of ['emailHash', 'providerId', 'trustScore', 'trust_score']) {
        expect(serialised).not.toContain(forbidden);
      }
    });
  });

  describe('password login (Revisi 1)', () => {
    const password = 'akhirnya-bisa-istirahat-99';

    async function setPassword(accessToken: string, value: string): Promise<void> {
      await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ password: value })
        .expect(200);
    }

    it('register → set → login works and sends no email', async () => {
      const { accessToken } = await login();
      await setPassword(accessToken, password);

      const before = await prisma.otpChallenge.count();

      const response = await http
        .post('/v1/auth/password/login')
        .set('x-client-platform', 'mobile')
        .send({ email, password })
        .expect(201);

      expect(response.body.data.accessToken).toBeTruthy();
      expect(response.body.data.refreshToken).toBeTruthy();
      expect(response.body.data.hasPassword).toBe(true);

      // The whole point of the feature: no OTP row means no email was sent.
      expect(await prisma.otpChallenge.count()).toBe(before);
    });

    it('answers wrong-password and unknown-email identically', async () => {
      const { accessToken } = await login();
      await setPassword(accessToken, password);
      await resetAbuseCounters();

      const wrongPassword = await http
        .post('/v1/auth/password/login')
        .send({ email, password: 'jelas-bukan-passwordnya' });

      const unknownEmail = await http
        .post('/v1/auth/password/login')
        .send({ email: `hantu-${Date.now()}@curhatdong.test`, password });

      // Same status, same code, same body shape — the login form must not be
      // usable to ask "does this address have an account here?".
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe('AUTH_CREDENTIALS_INVALID');
      expect(unknownEmail.body.error.code).toBe('AUTH_CREDENTIALS_INVALID');
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('never stores the password in plaintext', async () => {
      const { accessToken } = await login();
      await setPassword(accessToken, password);

      const account = await prisma.authAccount.findFirstOrThrow({
        where: {
          emailHash: hashEmail(
            email,
            app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV).TOKEN_ENCRYPTION_KEY,
          ),
        },
        select: { userId: true },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: account.userId } });

      expect(user.passwordHash).toMatch(/^scrypt-v1\$/);
      expect(JSON.stringify(user)).not.toContain(password);
    });

    it('rejects a weak password with a specific code', async () => {
      const { accessToken } = await login();

      const short = await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ password: 'pendek7' });
      expect(short.status).toBe(400);

      const sameAsEmail = await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ password: email });
      expect(sameAsEmail.status).toBe(400);
      expect(sameAsEmail.body.error.code).toBe('AUTH_PASSWORD_WEAK');
    });

    it('requires re-auth to change: stale session without currentPassword → 401', async () => {
      const { accessToken } = await login();
      await setPassword(accessToken, password);

      // Age the session past the freshness window straight in the database.
      const account = await prisma.authAccount.findFirstOrThrow({
        where: {
          emailHash: hashEmail(
            email,
            app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV).TOKEN_ENCRYPTION_KEY,
          ),
        },
        select: { userId: true },
      });
      await prisma.userSession.updateMany({
        where: { userId: account.userId },
        data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const withoutCurrent = await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ password: 'password-baru-yang-lain' });
      expect(withoutCurrent.status).toBe(401);
      expect(withoutCurrent.body.error.code).toBe('AUTH_CREDENTIALS_INVALID');

      const withCurrent = await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ password: 'password-baru-yang-lain', currentPassword: password });
      expect(withCurrent.status).toBe(200);
      expect(withCurrent.body.data.changed).toBe(true);

      // Restore for later cases.
      await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ password, currentPassword: 'password-baru-yang-lain' })
        .expect(200);
    });

    it('a password change revokes every other session but keeps the current one', async () => {
      const first = await login();
      await setPassword(first.accessToken, password);

      // A second, independent session for the same account.
      const second = await http
        .post('/v1/auth/password/login')
        .set('x-client-platform', 'mobile')
        .send({ email, password })
        .expect(201);
      const secondRefresh = second.body.data.refreshToken as string;

      // Change the password from the second session (fresh, so no
      // currentPassword needed — the forgot-password shape).
      await http
        .post('/v1/auth/password')
        .set('authorization', `Bearer ${second.body.data.accessToken}`)
        .send({ password: 'ganti-karena-khawatir-1' })
        .expect(200);

      // The first session's refresh token is now dead...
      await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: first.refreshToken })
        .expect(401);

      // ...the changing session's still works.
      await http
        .post('/v1/auth/refresh')
        .set('x-client-platform', 'mobile')
        .send({ refreshToken: secondRefresh })
        .expect(201);

      // Restore for any case after this one.
      const fresh = await http
        .post('/v1/auth/password/login')
        .set('x-client-platform', 'mobile')
        .send({ email, password: 'ganti-karena-khawatir-1' })
        .expect(201);
      await setPassword(fresh.body.data.accessToken, password);
    });

    it('rate limits repeated failures per email', async () => {
      const { accessToken } = await login();
      await setPassword(accessToken, password);
      await resetAbuseCounters();

      // The default budget is 10/hour; burn it with wrong guesses. The
      // Turnstile anomaly gate fires from the same loopback address after a
      // handful of attempts — that is the *other* defence working — so its
      // counters are cleared each round to keep this case about the rate
      // limit itself.
      let limited = false;
      for (let i = 0; i < 12; i++) {
        const turnstileKeys = await redis.keys('turnstile:attempts:*');
        if (turnstileKeys.length > 0) await redis.del(...turnstileKeys);

        const attempt = await http
          .post('/v1/auth/password/login')
          .send({ email, password: `salah-${i}` });
        if (attempt.status === 429) {
          limited = true;
          expect(attempt.body.error.code).toBe('RATE_LIMITED');
          break;
        }
      }
      expect(limited).toBe(true);
    });

    it('verifyOtp reports hasPassword so the client knows to show the create step', async () => {
      const tokens = await login();
      expect(typeof tokens).toBe('object');

      await resetAbuseCounters();
      await http.post('/v1/auth/otp/request').send({ email }).expect(202);
      const code = await latestOtpCodeFor(email);
      const response = await http
        .post('/v1/auth/otp/verify')
        .set('x-client-platform', 'mobile')
        .send({ email, code })
        .expect(201);

      // This account set a password in an earlier case, so the flag is true;
      // what matters is that the field exists and is a boolean.
      expect(typeof response.body.data.hasPassword).toBe('boolean');
    });
  });
});
