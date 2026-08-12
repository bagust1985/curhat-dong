import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { hashEmail, hashToken } from '@curhat/auth';
import type { PrismaClient } from '@curhat/database';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ResponseInterceptor } from '../../common/response.interceptor.js';
import { ENV } from '../../config/env.config.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import { AliasService } from '../profiles/alias.service.js';
import { AnonymousIdentityService } from '../profiles/anonymous-identity.service.js';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const FULL_CONSENT = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

describeDb('onboarding, consent & identity', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: {
    status: string;
    keys: (p: string) => Promise<string[]>;
    del: (...k: string[]) => Promise<number>;
    once: (event: string, listener: () => void) => unknown;
  };
  let http: ReturnType<typeof request>;
  let encryptionKey: string;

  const createdUserIds: string[] = [];

  async function clearCounters(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:attempts:*')),
      ...(await redis.keys('ratelimit:otp:*')),
      ...(await redis.keys('agegate:blocked:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }

  /** Signs up a brand-new account and returns its access token. */
  async function freshAccount(): Promise<{ token: string; userId: string; email: string }> {
    await clearCounters();
    const email = `uji-${Date.now()}-${Math.trunc(Math.random() * 1e6)}@curhatdong.test`;

    await http.post('/v1/auth/otp/request').send({ email }).expect(202);

    const emailHash = hashEmail(email, encryptionKey);
    const challenge = await prisma.otpChallenge.findFirstOrThrow({
      where: { emailHash },
      orderBy: { createdAt: 'desc' },
    });

    let code = '';
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = i.toString().padStart(6, '0');
      if (hashToken(candidate, encryptionKey) === challenge.codeHash) {
        code = candidate;
        break;
      }
    }

    const response = await http
      .post('/v1/auth/otp/verify')
      .set('x-client-platform', 'mobile')
      .send({ email, code })
      .expect(201);

    const account = await prisma.authAccount.findFirstOrThrow({
      where: { emailHash },
      select: { userId: true },
    });

    createdUserIds.push(account.userId);
    return { token: response.body.data.accessToken, userId: account.userId, email };
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
    encryptionKey = app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV).TOKEN_ENCRYPTION_KEY;
    http = request(app.getHttpServer());

    if (redis.status !== 'ready') {
      await new Promise<void>((resolveReady) => redis.once('ready', resolveReady));
    }
  }, 120_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await clearCounters();
    await app.close();
  });

  describe('age gate (PRD §25.5)', () => {
    it('refuses onboarding for a user who declares under 18', async () => {
      const { token } = await freshAccount();

      const response = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: false, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('AGE_GATE_REJECTED');
    });

    it('puts the device on cooldown so retrying immediately does not work', async () => {
      // Otherwise the obvious next move — answer differently — succeeds on the
      // second try, and the gate means nothing.
      const { token } = await freshAccount();
      const deviceId = `dev-cooldown-${Date.now()}`;

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: false, consents: FULL_CONSENT, deviceId })
        .expect(403);

      const retry = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId });

      expect(retry.status).toBe(403);
      expect(retry.body.error.code).toBe('AGE_GATE_COOLDOWN');
    });

    it('records the declaration timestamp when accepted', async () => {
      const { token, userId } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-ok-${Date.now()}` })
        .expect(201);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.ageDeclaredAt).toBeInstanceOf(Date);
    });
  });

  describe('consent (PRD §25.3)', () => {
    it('refuses onboarding without both required consents', async () => {
      const { token } = await freshAccount();

      const response = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({
          isAdult: true,
          consents: [
            { consentType: 'tos_privacy', granted: true },
            { consentType: 'sensitive_processing', granted: false },
          ],
          deviceId: `dev-${Date.now()}`,
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CONSENT_REQUIRED');
    });

    it('accepts onboarding when analytics is refused', async () => {
      // Analytics is optional. If refusing it blocked signup it would not be
      // optional at all.
      const { token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);
    });

    it('leaves every core endpoint working without analytics consent', async () => {
      // The real test of "optional": nothing degrades.
      const { token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      await http.get('/v1/me').set('authorization', `Bearer ${token}`).expect(200);
      await http.get('/v1/me/consents').set('authorization', `Bearer ${token}`).expect(200);
      await http
        .get('/v1/me/notification-settings')
        .set('authorization', `Bearer ${token}`)
        .expect(200);
      await http.get('/v1/me/blocked').set('authorization', `Bearer ${token}`).expect(200);
    });

    it('records a refusal instead of skipping it', async () => {
      const { token, userId } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      const analytics = await prisma.consentRecord.findFirstOrThrow({
        where: { userId, consentType: 'analytics' },
      });

      expect(analytics.granted).toBe(false);
      expect(analytics.revokedAt).not.toBeNull();
    });

    it('keeps history when consent is revoked, rather than deleting the row', async () => {
      const { token, userId } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({
          isAdult: true,
          consents: [
            { consentType: 'tos_privacy', granted: true },
            { consentType: 'sensitive_processing', granted: true },
            { consentType: 'analytics', granted: true },
          ],
          deviceId: `dev-${Date.now()}`,
        })
        .expect(201);

      await http
        .post('/v1/me/consents')
        .set('authorization', `Bearer ${token}`)
        .send({ consents: [{ consentType: 'analytics', granted: false }] })
        .expect(201);

      const record = await prisma.consentRecord.findFirstOrThrow({
        where: { userId, consentType: 'analytics' },
      });

      expect(record.granted).toBe(false);
      expect(record.revokedAt).not.toBeNull();
      expect(record.grantedAt).toBeInstanceOf(Date);
    });
  });

  describe('onboarding (PRD §5)', () => {
    it('is idempotent when a client retries', async () => {
      const { token } = await freshAccount();
      const payload = {
        isAdult: true,
        consents: FULL_CONSENT,
        deviceId: `dev-${Date.now()}`,
        topics: ['work', 'loneliness'],
      };

      const first = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      const second = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      expect(second.body.data.alias).toBe(first.body.data.alias);
    });

    it('generates an alias when none is supplied', async () => {
      const { token } = await freshAccount();

      const response = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      expect(response.body.data.alias).toMatch(/^[A-Za-z]+$/);
    });

    it('leaves no half-created profile when the alias is taken', async () => {
      const first = await freshAccount();
      const chosen = `Uji${Date.now()}`;

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${first.token}`)
        .send({
          isAdult: true,
          consents: FULL_CONSENT,
          alias: chosen,
          deviceId: `dev-${Date.now()}`,
        })
        .expect(201);

      const second = await freshAccount();

      const conflict = await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${second.token}`)
        .send({
          isAdult: true,
          consents: FULL_CONSENT,
          alias: chosen,
          deviceId: `dev-${Date.now()}`,
        });

      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('ALIAS_TAKEN');

      // The failed attempt must not have created a profile.
      const profile = await prisma.userProfile.findUnique({ where: { userId: second.userId } });
      expect(profile).toBeNull();
    });
  });

  describe('alias rules (PRD §4)', () => {
    it('rejects offensive and impersonating aliases', async () => {
      const alias = app.get(AliasService);

      for (const bad of [
        'anjing',
        'Si_Babi',
        'BabiNgepet',
        'admin',
        'CurhatDongOfficial',
        'a n j i n g',
        'Asu',
        'AsuBesar',
      ]) {
        expect(alias.validate(bad).valid, `${bad} should be rejected`).toBe(false);
      }
    });

    it('accepts ordinary aliases that merely contain a short blocked word', () => {
      // "PurnamaSunyi" contains "asu"; rejecting it would refuse a perfectly
      // ordinary name, and the generator itself produces this combination.
      const alias = app.get(AliasService);

      for (const good of [
        'LangitMalam',
        'Senja_Teduh',
        'Kabut 12',
        'PurnamaSunyi',
        'CakrawalaSunyi',
        'LenteraSunyi',
      ]) {
        expect(alias.validate(good).valid, `${good} should be accepted`).toBe(true);
      }
    });

    it('generates aliases that pass its own validation', () => {
      const alias = app.get(AliasService);

      for (let i = 0; i < 200; i++) {
        expect(alias.validate(alias.generate()).valid).toBe(true);
      }
    });
  });

  describe('anonymous identity (PRD §4)', () => {
    it('gives the same author a different code on each post', async () => {
      // A code derived from the user id would be identical every time, letting
      // anyone group a person's anonymous posts just by reading the feed.
      const identities = app.get(AnonymousIdentityService);
      const { userId, token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      const category = await prisma.postCategory.findFirstOrThrow();
      const codes = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const post = await prisma.curhatPost.create({
          data: {
            authorId: userId,
            categoryId: category.id,
            body: `uji anonim ${i}`,
            mood: 'kosong',
            intent: 'cuma_didengar',
            anonymityMode: 'anonymous',
          },
        });
        codes.add(await identities.createForPost(userId, post.id));
      }

      expect(codes.size).toBeGreaterThan(1);
    });

    it('keeps the author link for moderation without exposing it', async () => {
      const identities = app.get(AnonymousIdentityService);
      const { userId } = await freshAccount();

      const category = await prisma.postCategory.findFirstOrThrow();
      const post = await prisma.curhatPost.create({
        data: {
          authorId: userId,
          categoryId: category.id,
          body: 'uji',
          mood: 'kosong',
          intent: 'cuma_didengar',
          anonymityMode: 'anonymous',
        },
      });

      await identities.createForPost(userId, post.id);

      const label = await identities.displayCodeForPost(post.id);
      expect(label).toMatch(/^Anonymous #[A-Z]\d{4}$/);
      expect(label).not.toContain(userId);

      expect(await identities.authorIdForModeration(post.id)).toBe(userId);
    });
  });

  describe('data export (PRD §25.2)', () => {
    it('contains only the requester’s own data and says what is missing', async () => {
      const { token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      const response = await http
        .get('/v1/me/export/preview')
        .set('authorization', `Bearer ${token}`)
        .expect(200);

      const data = response.body.data;
      expect(data.profile).toBeTruthy();
      expect(Array.isArray(data.posts)).toBe(true);
      // A shared conversation is not one person's to export.
      expect(data).not.toHaveProperty('roomMessages');
      expect(data.notes.join(' ')).toContain('private room');
    });
  });

  describe('account deletion (PRD §25.4)', () => {
    it('states the irreversibility of anonymize before confirmation', async () => {
      const { token } = await freshAccount();

      const response = await http
        .get('/v1/me/deletion-consequences?mode=anonymize')
        .set('authorization', `Bearer ${token}`)
        .expect(200);

      const text = response.body.data.consequences.join(' ');
      expect(text).toContain('TIDAK BISA dibatalkan');
      expect(text).toContain('private room');
    });

    it('requires a typed confirmation', async () => {
      const { token } = await freshAccount();

      await http
        .delete('/v1/me')
        .set('authorization', `Bearer ${token}`)
        .send({ mode: 'purge' })
        .expect(400);
    });

    it('revokes every session immediately, whichever mode is chosen', async () => {
      const { token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      await http
        .delete('/v1/me')
        .set('authorization', `Bearer ${token}`)
        .send({ mode: 'purge', confirmation: 'HAPUS AKUN' })
        .expect(200);

      await http.get('/v1/me').set('authorization', `Bearer ${token}`).expect(401);
    });

    it('keeps content during the grace period for a purge', async () => {
      // The grace period exists so a compromised account, or a decision
      // regretted overnight, can still be recovered.
      const { token, userId } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      const category = await prisma.postCategory.findFirstOrThrow();
      const post = await prisma.curhatPost.create({
        data: {
          authorId: userId,
          categoryId: category.id,
          body: 'masih ada selama grace period',
          mood: 'lega',
          intent: 'cuma_didengar',
        },
      });

      const response = await http
        .delete('/v1/me')
        .set('authorization', `Bearer ${token}`)
        .send({ mode: 'purge', confirmation: 'HAPUS AKUN' })
        .expect(200);

      const effectiveAt = new Date(response.body.data.effectiveAt);
      expect(effectiveAt.getTime()).toBeGreaterThan(Date.now() + 25 * 86_400_000);

      expect(await prisma.curhatPost.findUnique({ where: { id: post.id } })).not.toBeNull();
    });
  });

  describe('notification settings (PRD §14)', () => {
    it('defaults quiet hours on', async () => {
      const { token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      const response = await http
        .get('/v1/me/notification-settings')
        .set('authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.quietHoursEnabled).toBe(true);
      expect(response.body.data.perTypeToggles.safety.push).toBe(true);
    });

    it('lets a user switch the Felt Heard prompt off permanently', async () => {
      // PRD §9: the prompt must be dismissible for good, or it becomes the
      // thing that drives people away.
      const { token } = await freshAccount();

      await http
        .post('/v1/onboarding')
        .set('authorization', `Bearer ${token}`)
        .send({ isAdult: true, consents: FULL_CONSENT, deviceId: `dev-${Date.now()}` })
        .expect(201);

      const response = await http
        .patch('/v1/me/notification-settings')
        .set('authorization', `Bearer ${token}`)
        .send({ feltHeardPromptEnabled: false })
        .expect(200);

      expect(response.body.data.feltHeardPromptEnabled).toBe(false);
    });
  });
});
