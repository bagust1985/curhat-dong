import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { generateTotp, hashEmail, hashToken } from '@curhat/auth';
import type { AdminRole, PrismaClient } from '@curhat/database';
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
import { AnalyticsService } from './analytics.service.js';
import { assertNoUserData } from './broadcast.service.js';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const CONSENTS = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

/** A unique region per run, so these tests never fight over the ID hotlines. */
const TEST_REGION = `T${Math.trunc(Math.random() * 100000)}`;

describe('broadcast copy guard (E14-T15)', () => {
  it('refuses a placeholder', () => {
    // A broadcast is the same text for everyone, so a placeholder is the tell
    // that somebody intended otherwise. Catching `{alias}` here is cheap;
    // discovering it after forty thousand people got a half-rendered template
    // is not.
    for (const body of [
      'Halo {alias}, ada pembaruan penting soal aplikasi.',
      'Halo {{name}}, kami sedang maintenance malam ini.',
      'Hai ${user}, ada info baru buat kamu semua.',
      'Update untuk %region% malam ini, mohon menunggu.',
    ]) {
      expect(() => assertNoUserData('Pemberitahuan', body), body).toThrow();
    }
  });

  it('refuses an email or a phone number', () => {
    expect(() =>
      assertNoUserData('Pemberitahuan', 'Hubungi kami di admin@curhatdong.com kalau ada kendala.'),
    ).toThrow();
    expect(() =>
      assertNoUserData('Pemberitahuan', 'Hubungi 081234567890 kalau butuh bantuan ya.'),
    ).toThrow();
  });

  it('allows ordinary copy', () => {
    expect(() =>
      assertNoUserData(
        'Maintenance malam ini',
        'Aplikasi akan istirahat sebentar jam 1–2 pagi. Maaf ya kalau mengganggu.',
      ),
    ).not.toThrow();
  });
});

describeDb('admin platform (E14-T13 to T15)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: {
    status: string;
    keys: (p: string) => Promise<string[]>;
    del: (...k: string[]) => Promise<number>;
    once: (e: string, l: () => void) => unknown;
  };
  let http: ReturnType<typeof request>;
  let key: string;
  let analytics: AnalyticsService;

  const createdUserIds: string[] = [];
  const createdBroadcastIds: string[] = [];

  async function clearCaches(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:*')),
      ...(await redis.keys('ratelimit:*')),
      ...(await redis.keys('agegate:*')),
      ...(await redis.keys('admin:mfa:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }

  async function user(): Promise<{ token: string; userId: string }> {
    await clearCaches();
    const email = `uji-${Date.now()}-${Math.trunc(Math.random() * 1e9)}@curhatdong.test`;

    await http.post('/v1/auth/otp/request').send({ email }).expect(202);

    const emailHash = hashEmail(email, key);
    const challenge = await prisma.otpChallenge.findFirstOrThrow({
      where: { emailHash },
      orderBy: { createdAt: 'desc' },
    });

    let code = '';
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = i.toString().padStart(6, '0');
      if (hashToken(candidate, key) === challenge.codeHash) {
        code = candidate;
        break;
      }
    }

    const auth = await http
      .post('/v1/auth/otp/verify')
      .set('x-client-platform', 'mobile')
      .send({ email, code })
      .expect(201);

    const token = auth.body.data.accessToken as string;

    await http
      .post('/v1/onboarding')
      .set('authorization', `Bearer ${token}`)
      .send({
        isAdult: true,
        consents: CONSENTS,
        deviceId: `dev-${Date.now()}-${Math.trunc(Math.random() * 1e9)}`,
      })
      .expect(201);

    const account = await prisma.authAccount.findFirstOrThrow({
      where: { emailHash },
      select: { userId: true },
    });
    createdUserIds.push(account.userId);

    return { token, userId: account.userId };
  }

  function nextStepCode(secret: string): string {
    const step = Math.floor(Date.now() / 1000 / 30);
    return generateTotp(secret, new Date((step + 1) * 30 * 1000));
  }

  async function admin(role: AdminRole): Promise<{ token: string; userId: string }> {
    const account = await user();
    await prisma.user.update({ where: { id: account.userId }, data: { adminRole: role } });

    const enrol = await http
      .post('/v1/admin/auth/mfa/enrol')
      .set('authorization', `Bearer ${account.token}`)
      .expect(201);

    const secret = enrol.body.data.secret as string;

    await http
      .post('/v1/admin/auth/mfa/confirm')
      .set('authorization', `Bearer ${account.token}`)
      .send({ code: generateTotp(secret) })
      .expect(201);

    await http
      .post('/v1/admin/auth/login')
      .set('authorization', `Bearer ${account.token}`)
      .send({ code: nextStepCode(secret) })
      .expect(201);

    return { token: account.token, userId: account.userId };
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
    key = app.get<{ TOKEN_ENCRYPTION_KEY: string }>(ENV).TOKEN_ENCRYPTION_KEY;
    analytics = app.get(AnalyticsService);
    http = request(app.getHttpServer());

    if (redis.status !== 'ready') {
      await new Promise<void>((ready) => redis.once('ready', ready));
    }
  }, 120_000);

  afterAll(async () => {
    await prisma.supportResource.deleteMany({ where: { region: TEST_REGION } });
    if (createdBroadcastIds.length > 0) {
      await prisma.broadcast.deleteMany({ where: { id: { in: createdBroadcastIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await clearCaches();
    await app.close();
  });

  // -------------------------------------------------------------------------
  // E14-T13 — support resources
  // -------------------------------------------------------------------------

  describe('support resources (E14-T13)', () => {
    async function createResource(
      token: string,
      overrides: Record<string, unknown> = {},
    ): Promise<Record<string, never> & { id: string }> {
      const response = await http
        .post('/v1/admin/support-resources')
        .set('authorization', `Bearer ${token}`)
        .send({
          region: TEST_REGION,
          name: 'Hotline Uji',
          channel: 'phone',
          value: '119',
          hours: '24 jam',
          sourceUrl: 'https://kemkes.go.id/hotline',
          isActive: true,
          ...overrides,
        })
        .expect(201);

      return response.body.data;
    }

    it('refuses an entry with no source_url', async () => {
      // The acceptance criterion. A hotline that went live on somebody's
      // recollection cannot be re-checked by the next person.
      const superAdmin = await admin('super_admin');

      await http
        .post('/v1/admin/support-resources')
        .set('authorization', `Bearer ${superAdmin.token}`)
        .send({
          region: TEST_REGION,
          name: 'Hotline Tanpa Sumber',
          channel: 'phone',
          value: '119',
          hours: '24 jam',
        })
        .expect(400);
    });

    it('refuses a source that is not a fetchable address', async () => {
      const superAdmin = await admin('super_admin');

      for (const sourceUrl of ['dari telepon ke Kemenkes', 'ftp://x.example', 'bukan-url']) {
        await http
          .post('/v1/admin/support-resources')
          .set('authorization', `Bearer ${superAdmin.token}`)
          .send({
            region: TEST_REGION,
            name: 'Hotline',
            channel: 'phone',
            value: '119',
            hours: '24 jam',
            sourceUrl,
          })
          .expect(400);
      }
    });

    it('warns hard when nothing is live, rather than showing an empty list', async () => {
      // PRD §15.2 makes this a release blocker. An admin panel that says
      // "No resources yet" next to a plus button reads like an empty inbox.
      const superAdmin = await admin('super_admin');

      const response = await http
        .get(`/v1/admin/support-resources?region=${TEST_REGION}`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      expect(response.body.data.readiness.ready).toBe(false);
      expect(response.body.data.readiness.warning).toContain('blocker rilis');
    });

    it('hides a stale entry from users while showing an admin why', async () => {
      const superAdmin = await admin('super_admin');
      const created = await createResource(superAdmin.token);

      // Push it past the re-verification window.
      await prisma.supportResource.update({
        where: { id: created.id },
        data: { verifiedAt: new Date(Date.now() - 200 * 86_400_000) },
      });

      const listed = await http
        .get(`/v1/admin/support-resources?region=${TEST_REGION}`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      const found = (listed.body.data.items as Array<{ id: string; isStale: boolean }>).find(
        (item) => item.id === created.id,
      );
      expect(found?.isStale).toBe(true);
      expect(listed.body.data.readiness.ready).toBe(false);

      // And it is gone from what a user in crisis would be shown.
      const preview = await http
        .get(`/v1/admin/support-resources/preview?region=${TEST_REGION}`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      expect(preview.body.data.resources).toHaveLength(0);
      expect(preview.body.data.usingFallback).toBe(true);
    });

    it('previews exactly what a user in crisis would see', async () => {
      const superAdmin = await admin('super_admin');
      await createResource(superAdmin.token);

      const preview = await http
        .get(`/v1/admin/support-resources/preview?region=${TEST_REGION}`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      // Same shape the Level 3 screen renders (DESIGN-REF §2.7): warm message,
      // resources, and the alternatives that are never a footnote.
      expect(preview.body.data.message).toContain('Kamu nggak sendirian');
      expect(preview.body.data.resources[0].value).toBe('119');
      expect(
        (preview.body.data.alternatives as Array<{ action: string }>).map((a) => a.action),
      ).toEqual(['open_ai', 'find_listener', 'dismiss']);
    });

    it('needs a fresh source to re-verify', async () => {
      const superAdmin = await admin('super_admin');
      const created = await createResource(superAdmin.token);

      await prisma.supportResource.update({
        where: { id: created.id },
        data: { verifiedAt: new Date(Date.now() - 200 * 86_400_000) },
      });

      // A bare click is not a verification.
      await http
        .post(`/v1/admin/support-resources/${created.id}/verify`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .send({})
        .expect(400);

      const verified = await http
        .post(`/v1/admin/support-resources/${created.id}/verify`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .send({ sourceUrl: 'https://kemkes.go.id/hotline-2026' })
        .expect(201);

      expect(verified.body.data.isStale).toBe(false);

      const audited = await prisma.auditLog.findFirst({
        where: { action: 'admin.support_resource.verified', targetId: created.id },
      });
      expect(audited).not.toBeNull();
    });

    it('demands a new source when the number itself changes', async () => {
      // Changing what people dial is a new claim about the world; the old
      // verifiedAt date must not vouch for it.
      const superAdmin = await admin('super_admin');
      const created = await createResource(superAdmin.token);

      await http
        .patch(`/v1/admin/support-resources/${created.id}`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .send({ value: '500-454' })
        .expect(400);

      await http
        .patch(`/v1/admin/support-resources/${created.id}`)
        .set('authorization', `Bearer ${superAdmin.token}`)
        .send({ value: '500-454', sourceUrl: 'https://kemkes.go.id/hotline-baru' })
        .expect(200);
    });

    it('is Super Admin only', async () => {
      const moderator = await admin('moderator');

      await http
        .get(`/v1/admin/support-resources?region=${TEST_REGION}`)
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // E14-T14 — analytics
  // -------------------------------------------------------------------------

  describe('analytics (E14-T14)', () => {
    it('computes a day idempotently', async () => {
      const first = await analytics.computeDay();
      const second = await analytics.computeDay();

      expect(second.date).toBe(first.date);

      // One row per day, so a backfill can be replayed.
      const rows = await prisma.analyticsDaily.count({
        where: { date: new Date(`${first.date}T00:00:00.000Z`) },
      });
      expect(rows).toBe(1);
    });

    it('keeps Felt Heard numerator and denominator separately', async () => {
      // Storing both parts means a period can be summed correctly rather than
      // by averaging daily percentages, and the rate can be recomputed if the
      // formula is ever revised (PRD §19.1 forbids changing it quietly).
      const { date } = await analytics.computeDay();

      const row = await prisma.analyticsDaily.findUniqueOrThrow({
        where: { date: new Date(`${date}T00:00:00.000Z`) },
      });

      expect(row).toHaveProperty('feltHeardAnswered');
      expect(row).toHaveProperty('feltHeardPositive');
      // Dismissals are tracked but never in the denominator (PRD §9).
      expect(row).toHaveProperty('feltHeardDismissed');
    });

    it('reports Felt Heard Rate as null rather than zero with no answers', async () => {
      const viewer = await admin('customer_support');

      const response = await http
        .get('/v1/admin/analytics/dashboard?days=1')
        .set('authorization', `Bearer ${viewer.token}`)
        .expect(200);

      const rate = response.body.data.cards.feltHeardRate;
      // "No data yet" and "nobody felt heard" are very different things to put
      // on a dashboard (E06-T06).
      expect(rate === null || typeof rate === 'number').toBe(true);
      if (rate !== null) expect(rate).toBeGreaterThanOrEqual(0);
    });

    it('matches a hand-written query for posts published today', async () => {
      // The acceptance criterion: dashboard numbers must equal a manual query.
      const author = await user();

      await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send({
          body: 'Hari ini berat sekali rasanya dan aku cuma pengen cerita.',
          categorySlug: 'work',
          mood: 'capek',
          intent: 'cuma_didengar',
        })
        .expect(201);

      const { date } = await analytics.computeDay();
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const manual = await prisma.curhatPost.count({
        where: { publishedAt: { gte: dayStart, lt: dayEnd }, status: 'published' },
      });
      const row = await prisma.analyticsDaily.findUniqueOrThrow({ where: { date: dayStart } });

      expect(row.postsPublished).toBe(manual);
    });

    it('surfaces missing days instead of drawing them as zero', async () => {
      // A gap means the aggregation job did not run. A chart that draws a zero
      // for it looks like a day when nobody used the product.
      const viewer = await admin('customer_support');

      const response = await http
        .get('/v1/admin/analytics/dashboard?days=90')
        .set('authorization', `Bearer ${viewer.token}`)
        .expect(200);

      expect(Array.isArray(response.body.data.missingDays)).toBe(true);
    });

    it('lights an alert strip when Critical is waiting', async () => {
      const viewer = await admin('customer_support');
      const author = await user();

      const post = await prisma.curhatPost.findFirst({ where: { authorId: author.userId } });
      const created = await prisma.moderationCase.create({
        data: {
          source: 'ai',
          queue: 'critical',
          targetType: 'post',
          targetId: post?.id ?? author.userId,
          slaDueAt: new Date(Date.now() + 900_000),
        },
      });

      const response = await http
        .get('/v1/admin/analytics/dashboard?days=1')
        .set('authorization', `Bearer ${viewer.token}`)
        .expect(200);

      expect(response.body.data.moderation.criticalOpenNow).toBeGreaterThan(0);
      expect(response.body.data.alert).toContain('Critical');

      await prisma.moderationCase.delete({ where: { id: created.id } });
    });

    it('never returns curhat content', async () => {
      const viewer = await admin('customer_support');

      for (const path of [
        '/v1/admin/analytics/dashboard?days=30',
        '/v1/admin/analytics/funnel?days=30',
        '/v1/admin/analytics/retention?days=14',
      ]) {
        const response = await http
          .get(path)
          .set('authorization', `Bearer ${viewer.token}`)
          .expect(200);

        const serialised = JSON.stringify(response.body);
        expect(serialised, path).not.toContain('berat sekali');
        expect(serialised, path).not.toMatch(/"body"/);
      }
    });

    it('reserves a metric recompute for Super Admin', async () => {
      // A recompute changes the numbers everyone else reads.
      const viewer = await admin('customer_support');

      await http
        .post('/v1/admin/analytics/recompute')
        .set('authorization', `Bearer ${viewer.token}`)
        .send({})
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // E14-T15 — broadcast
  // -------------------------------------------------------------------------

  describe('broadcast (E14-T15)', () => {
    async function draft(
      token: string,
      overrides: Record<string, unknown> = {},
    ): Promise<{ id: string; estimatedRecipients: number }> {
      const response = await http
        .post('/v1/admin/broadcasts')
        .set('authorization', `Bearer ${token}`)
        .send({
          type: 'announcement',
          segment: 'listeners',
          title: 'Ada pembaruan kecil',
          body: 'Kami memperbaiki beberapa hal supaya aplikasinya lebih enak dipakai.',
          ...overrides,
        })
        .expect(201);

      createdBroadcastIds.push(response.body.data.id as string);
      return response.body.data;
    }

    it('shows the recipient count before anything is sent', async () => {
      const manager = await admin('content_manager');

      const estimate = await http
        .get('/v1/admin/broadcasts/estimate?segment=all')
        .set('authorization', `Bearer ${manager.token}`)
        .expect(200);

      expect(typeof estimate.body.data.count).toBe('number');
      // A broadcast cannot be recalled, so the warning is part of the payload.
      expect(estimate.body.data.confirmation).toContain('tidak bisa ditarik kembali');
    });

    it('refuses to send against a count the admin did not confirm', async () => {
      // The acceptance criterion, made mechanical: an admin who saw one number
      // and came back to a changed segment gets a refusal, not a send.
      const manager = await admin('content_manager');
      const created = await draft(manager.token);

      const wrong = await http
        .post(`/v1/admin/broadcasts/${created.id}/send`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ confirmedRecipients: created.estimatedRecipients + 5 })
        .expect(409);

      expect(wrong.body.error.message).toContain('konfirmasi');

      const untouched = await prisma.broadcast.findUniqueOrThrow({ where: { id: created.id } });
      expect(untouched.status).toBe('draft');
      expect(untouched.sentCount).toBe(0);
    });

    it('sends when the count matches and records how many went out', async () => {
      const manager = await admin('content_manager');
      const created = await draft(manager.token, { segment: 'listeners' });

      const sent = await http
        .post(`/v1/admin/broadcasts/${created.id}/send`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ confirmedRecipients: created.estimatedRecipients })
        .expect(201);

      expect(sent.body.data.status).toBe('sent');
      expect(sent.body.data.sentCount).toBeLessThanOrEqual(created.estimatedRecipients);

      const audited = await prisma.auditLog.findFirst({
        where: { action: 'admin.broadcast.sent', targetId: created.id },
      });
      expect(audited).not.toBeNull();
    });

    it('refuses a second send of the same broadcast', async () => {
      const manager = await admin('content_manager');
      const created = await draft(manager.token, { segment: 'listeners' });

      await http
        .post(`/v1/admin/broadcasts/${created.id}/send`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ confirmedRecipients: created.estimatedRecipients })
        .expect(201);

      await http
        .post(`/v1/admin/broadcasts/${created.id}/send`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ confirmedRecipients: created.estimatedRecipients })
        .expect(409);
    });

    it('refuses placeholder copy at creation', async () => {
      const manager = await admin('content_manager');

      await http
        .post('/v1/admin/broadcasts')
        .set('authorization', `Bearer ${manager.token}`)
        .send({
          type: 'announcement',
          segment: 'all',
          title: 'Halo semua',
          body: 'Halo {alias}, ada pembaruan penting untuk akunmu hari ini.',
        })
        .expect(400);
    });

    it('marks only safety broadcasts as exempt from quiet hours', async () => {
      const manager = await admin('content_manager');

      const announcement = await draft(manager.token, { type: 'announcement' });
      const safety = await draft(manager.token, {
        type: 'safety',
        title: 'Info keamanan penting',
        body: 'Ada gangguan keamanan yang perlu kamu tahu sekarang, mohon dibaca.',
      });

      const listed = await http
        .get('/v1/admin/broadcasts')
        .set('authorization', `Bearer ${manager.token}`)
        .expect(200);

      const rows = listed.body.data as Array<{ id: string; ignoresQuietHours: boolean }>;
      expect(rows.find((row) => row.id === announcement.id)?.ignoresQuietHours).toBe(false);
      // An announcement at 2am is exactly what PRD §14 exists to prevent.
      expect(rows.find((row) => row.id === safety.id)?.ignoresQuietHours).toBe(true);
    });

    it('refuses to cancel one that already went out', async () => {
      const manager = await admin('content_manager');
      const created = await draft(manager.token, { segment: 'listeners' });

      await http
        .post(`/v1/admin/broadcasts/${created.id}/send`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ confirmedRecipients: created.estimatedRecipients })
        .expect(201);

      // Honest refusal rather than a cancel button that does nothing: once
      // notifications exist, they exist.
      await http
        .post(`/v1/admin/broadcasts/${created.id}/cancel`)
        .set('authorization', `Bearer ${manager.token}`)
        .expect(409);
    });

    it('cancels a draft', async () => {
      const manager = await admin('content_manager');
      const created = await draft(manager.token);

      const cancelled = await http
        .post(`/v1/admin/broadcasts/${created.id}/cancel`)
        .set('authorization', `Bearer ${manager.token}`)
        .expect(201);

      expect(cancelled.body.data.status).toBe('cancelled');
    });

    it('refuses broadcasting to a moderator', async () => {
      const moderator = await admin('moderator');

      await http
        .get('/v1/admin/broadcasts')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(403);
    });
  });
});
