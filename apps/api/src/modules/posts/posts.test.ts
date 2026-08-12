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
import { LocalRulesService } from '../safety/local-rules.service.js';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const CONSENTS = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

describeDb('posts & feed', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: {
    status: string;
    keys: (p: string) => Promise<string[]>;
    del: (...k: string[]) => Promise<number>;
    once: (event: string, listener: () => void) => unknown;
  };
  let http: ReturnType<typeof request>;
  let key: string;

  const createdUserIds: string[] = [];

  async function clearCaches(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:attempts:*')),
      ...(await redis.keys('ratelimit:*')),
      ...(await redis.keys('agegate:blocked:*')),
      ...(await redis.keys('feed:*')),
      ...(await redis.keys('categories:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }

  async function onboardedUser(): Promise<{ token: string; userId: string; alias: string }> {
    await clearCaches();
    const email = `uji-${Date.now()}-${Math.trunc(Math.random() * 1e6)}@curhatdong.test`;

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

    const onboarding = await http
      .post('/v1/onboarding')
      .set('authorization', `Bearer ${token}`)
      .send({
        isAdult: true,
        consents: CONSENTS,
        deviceId: `dev-${Date.now()}-${Math.trunc(Math.random() * 1e6)}`,
        topics: ['work'],
      })
      .expect(201);

    const account = await prisma.authAccount.findFirstOrThrow({
      where: { emailHash },
      select: { userId: true },
    });
    createdUserIds.push(account.userId);

    return { token, userId: account.userId, alias: onboarding.body.data.alias };
  }

  const validPost = {
    body: 'Hari ini capek banget di kantor, rasanya pengen cerita ke seseorang.',
    categorySlug: 'work',
    mood: 'capek',
    intent: 'cuma_didengar',
  };

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
    http = request(app.getHttpServer());

    if (redis.status !== 'ready') {
      await new Promise<void>((ready) => redis.once('ready', ready));
    }
  }, 120_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await clearCaches();
    await app.close();
  });

  describe('create curhat (PRD §7)', () => {
    it('publishes an ordinary post', async () => {
      const { token } = await onboardedUser();

      const response = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send(validPost)
        .expect(201);

      expect(response.body.data.status).toBe('published');
    });

    it('never publishes at L0 while the AI classifier is unavailable', async () => {
      // TECH-SPEC §4.2: with no classifier, a quiet post publishes at L1 and is
      // flagged for re-analysis. Publishing at L0 would treat "we did not
      // check" as "we checked and it was fine" — the bypass non-negotiable #1
      // forbids.
      const { token } = await onboardedUser();

      const response = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send(validPost)
        .expect(201);

      const post = await prisma.curhatPost.findUniqueOrThrow({
        where: { id: response.body.data.postId },
      });

      expect(post.safetyLevel).toBe('L1');
      expect(post.needsReanalysis).toBe(true);
    });

    it('holds a post with a local high-risk signal instead of publishing it', async () => {
      const { token } = await onboardedUser();

      const response = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({
          ...validPost,
          body: 'Aku capek banget, rasanya aku mau bunuh diri aja malam ini.',
        })
        .expect(201);

      expect(response.body.data.status).toBe('held');

      const post = await prisma.curhatPost.findUniqueOrThrow({
        where: { id: response.body.data.postId },
      });
      expect(post.status).toBe('held');
    });

    it('shows supportive intervention on a high-risk post, never a punishment', async () => {
      // PRD §8, non-negotiable #2: Level 3 is a signal someone needs help, not
      // a rule violation. No suspension, no score, no mention of a level.
      const { token, userId } = await onboardedUser();

      const response = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ ...validPost, body: 'Aku pengen mati aja, capek hidup begini terus.' })
        .expect(201);

      expect(response.body.data.intervention).toBeDefined();

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('L3');
      expect(serialised).not.toContain('safetyLevel');
      expect(serialised.toLowerCase()).not.toContain('suspend');

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.status).toBe('active');
    });

    it('opens a Critical moderation case for a held post', async () => {
      const { token } = await onboardedUser();

      const response = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ ...validPost, body: 'Aku mau bunuh diri, nggak sanggup lagi.' })
        .expect(201);

      const moderationCase = await prisma.moderationCase.findFirstOrThrow({
        where: { targetType: 'post', targetId: response.body.data.postId },
      });

      expect(moderationCase.queue).toBe('critical');
      expect(moderationCase.slaDueAt.getTime()).toBeLessThanOrEqual(Date.now() + 31 * 60_000);
    });

    it('warns about personal data before submitting, and still lets it through', async () => {
      // PRD §15: the warning informs, it never blocks. Sharing your own number
      // is your choice; the product only makes sure you noticed.
      const { token } = await onboardedUser();

      const warned = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ ...validPost, body: `${validPost.body} Nomor aku 081234567890 ya.` })
        .expect(201);

      expect(warned.body.data.personalDataWarning).toContain('informasi pribadi');
      expect(warned.body.data.postId).toBe('');

      const acknowledged = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({
          ...validPost,
          body: `${validPost.body} Nomor aku 081234567890 ya.`,
          acknowledgedPersonalDataWarning: true,
        })
        .expect(201);

      expect(acknowledged.body.data.status).toBe('published');
    });

    it('rejects a post that is too short to respond to', async () => {
      const { token } = await onboardedUser();

      await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ ...validPost, body: 'sedih' })
        .expect(400);
    });
  });

  describe('post visibility', () => {
    it('shows a held post only to its author', async () => {
      const author = await onboardedUser();
      const reader = await onboardedUser();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send({ ...validPost, body: 'Aku mau bunuh diri malam ini.' })
        .expect(201);

      const own = await http
        .get(`/v1/posts/${created.body.data.postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);
      expect(own.body.data.status).toBe('held');

      // 404 rather than 403: telling a reader a post exists but is withheld is
      // information they are not owed.
      await http
        .get(`/v1/posts/${created.body.data.postId}`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(404);
    });

    it('hides posts between blocked users, both ways', async () => {
      const author = await onboardedUser();
      const blocker = await onboardedUser();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send(validPost)
        .expect(201);

      await http
        .post(`/v1/users/${author.alias}/block`)
        .set('authorization', `Bearer ${blocker.token}`)
        .expect(201);

      await http
        .get(`/v1/posts/${created.body.data.postId}`)
        .set('authorization', `Bearer ${blocker.token}`)
        .expect(404);

      // And the blocked author must not see the blocker's posts either.
      const blockerPost = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${blocker.token}`)
        .send(validPost)
        .expect(201);

      await http
        .get(`/v1/posts/${blockerPost.body.data.postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(404);
    });

    it('never exposes the author id of an anonymous post', async () => {
      const author = await onboardedUser();
      const reader = await onboardedUser();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send({ ...validPost, anonymityMode: 'anonymous' })
        .expect(201);

      const response = await http
        .get(`/v1/posts/${created.body.data.postId}`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(response.body.data.authorAlias).toMatch(/^Anonymous #/);
      expect(JSON.stringify(response.body)).not.toContain(author.userId);
      expect(JSON.stringify(response.body)).not.toContain(author.alias);
    });
  });

  describe('own post management', () => {
    it('lets only the author delete', async () => {
      const author = await onboardedUser();
      const other = await onboardedUser();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send(validPost)
        .expect(201);

      await http
        .delete(`/v1/posts/${created.body.data.postId}`)
        .set('authorization', `Bearer ${other.token}`)
        .expect(403);

      await http
        .delete(`/v1/posts/${created.body.data.postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);
    });

    it('keeps moderation history after the author deletes a post', async () => {
      // Deleting a post must not erase the record of why it was actioned.
      const author = await onboardedUser();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send({ ...validPost, body: 'Aku mau bunuh diri, sudah nggak kuat.' })
        .expect(201);

      const postId = created.body.data.postId as string;

      await http
        .delete(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      const stillThere = await prisma.moderationCase.findFirst({
        where: { targetType: 'post', targetId: postId },
      });
      expect(stillThere).not.toBeNull();
    });
  });

  describe('feed (PRD §6, TECH-SPEC §4.7)', () => {
    it('paginates by cursor without duplicating or skipping', async () => {
      const { token } = await onboardedUser();

      for (let i = 0; i < 7; i++) {
        await http
          .post('/v1/posts')
          .set('authorization', `Bearer ${token}`)
          .send({ ...validPost, body: `${validPost.body} Catatan nomor ${i}.` })
          .expect(201);
      }

      const seen = new Set<string>();
      let cursor: string | null = null;
      let pages = 0;

      do {
        const url = `/v1/feed?tab=terbaru&limit=3${cursor ? `&cursor=${cursor}` : ''}`;
        const response: request.Response = await http
          .get(url)
          .set('authorization', `Bearer ${token}`)
          .expect(200);

        for (const item of response.body.data.items as Array<{ id: string }>) {
          expect(seen.has(item.id), 'feed returned a duplicate').toBe(false);
          seen.add(item.id);
        }

        cursor = response.body.data.nextCursor;
        pages += 1;
      } while (cursor && pages < 6);

      expect(seen.size).toBeGreaterThanOrEqual(7);
    });

    it('restarts from the top for a malformed cursor rather than erroring', async () => {
      const { token } = await onboardedUser();

      await http
        .get('/v1/feed?tab=terbaru&cursor=bukan-cursor-valid')
        .set('authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('excludes held posts from every tab', async () => {
      const { token } = await onboardedUser();

      const held = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ ...validPost, body: 'Aku mau bunuh diri sekarang juga.' })
        .expect(201);

      for (const tab of ['terbaru', 'butuh-didengar', 'untuk-kamu']) {
        const response = await http
          .get(`/v1/feed?tab=${tab}&limit=50`)
          .set('authorization', `Bearer ${token}`)
          .expect(200);

        const ids = (response.body.data.items as Array<{ id: string }>).map((i) => i.id);
        expect(ids).not.toContain(held.body.data.postId);
      }
    });

    it('applies both Butuh Didengar rules — response count and age', async () => {
      const { token, userId } = await onboardedUser();

      const category = await prisma.postCategory.findFirstOrThrow({ where: { slug: 'work' } });

      const answered = await prisma.curhatPost.create({
        data: {
          authorId: userId,
          categoryId: category.id,
          body: 'sudah dijawab dua orang',
          mood: 'capek',
          intent: 'cuma_didengar',
          status: 'published',
          safetyLevel: 'L1',
          responseCount: 2,
        },
      });

      const old = await prisma.curhatPost.create({
        data: {
          authorId: userId,
          categoryId: category.id,
          body: 'belum dijawab tapi sudah lama',
          mood: 'capek',
          intent: 'cuma_didengar',
          status: 'published',
          safetyLevel: 'L1',
          responseCount: 0,
          createdAt: new Date(Date.now() - 60 * 3_600_000),
        },
      });

      await clearCaches();

      const response = await http
        .get('/v1/feed?tab=butuh-didengar&limit=50')
        .set('authorization', `Bearer ${token}`)
        .expect(200);

      const ids = (response.body.data.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).not.toContain(answered.id);
      expect(ids).not.toContain(old.id);
    });

    it('keeps one user’s personalised feed out of another’s cache', async () => {
      // TECH-SPEC §8.1: caching a personalised response globally would serve
      // one person's feed to someone else.
      const first = await onboardedUser();
      const second = await onboardedUser();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${first.token}`)
        .send(validPost)
        .expect(201);

      await http
        .post(`/v1/users/${first.alias}/block`)
        .set('authorization', `Bearer ${second.token}`)
        .expect(201);

      const response = await http
        .get('/v1/feed?tab=terbaru&limit=50')
        .set('authorization', `Bearer ${second.token}`)
        .expect(200);

      const ids = (response.body.data.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).not.toContain(created.body.data.postId);
    });
  });

  describe('local rule engine (TECH-SPEC §4.1)', () => {
    it('does not treat ordinary sadness as a crisis', () => {
      // This product exists for exactly these sentences. Flagging them would
      // hold half the feed and teach people that being honest gets them
      // silenced.
      const rules = app.get(LocalRulesService);

      for (const ordinary of [
        'Aku capek banget hari ini.',
        'Rasanya sedih terus akhir-akhir ini.',
        'Aku lagi kosong, nggak tau harus gimana.',
        'Capek hidup kayak gini tapi ya dijalani aja.',
        'Semalam nangis sampai ketiduran.',
      ]) {
        expect(rules.evaluate(ordinary).highRisk, ordinary).toBe(false);
      }
    });

    it('flags explicit statements of intent', () => {
      const rules = app.get(LocalRulesService);

      for (const risky of [
        'aku mau bunuh diri malam ini',
        'gimana cara bunuh diri yang cepat',
        'aku pengen mati aja',
        'I want to kill myself',
      ]) {
        expect(rules.evaluate(risky).highRisk, risky).toBe(true);
      }
    });

    it('detects Indonesian personal data formats', () => {
      const rules = app.get(LocalRulesService);

      expect(rules.evaluate('NIK aku 3273010101900001').containsPersonalData).toBe(true);
      expect(rules.evaluate('WA aku 081234567890').containsPersonalData).toBe(true);
      expect(rules.evaluate('email aku halo@contoh.com').containsPersonalData).toBe(true);
    });

    it('does not flag ordinary numbers as personal data', () => {
      const rules = app.get(LocalRulesService);

      expect(rules.evaluate('Aku nunggu 30 menit di halte.').containsPersonalData).toBe(false);
      expect(rules.evaluate('Gajiku 5000000 sebulan.').containsPersonalData).toBe(false);
    });
  });
});
