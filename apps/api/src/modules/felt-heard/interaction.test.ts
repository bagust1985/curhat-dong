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
import { FeltHeardService } from './felt-heard.service.js';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const CONSENTS = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

describeDb('interaction & felt heard', () => {
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

  const createdUserIds: string[] = [];

  async function clearCaches(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:*')),
      ...(await redis.keys('ratelimit:*')),
      ...(await redis.keys('agegate:*')),
      ...(await redis.keys('feed:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }

  async function user(): Promise<{ token: string; userId: string; alias: string }> {
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

    const onboarded = await http
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

    return { token, userId: account.userId, alias: onboarded.body.data.alias };
  }

  async function postBy(token: string): Promise<string> {
    const response = await http
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        body: 'Hari ini berat banget rasanya, pengen cerita ke seseorang aja.',
        categorySlug: 'work',
        mood: 'capek',
        intent: 'cuma_didengar',
      })
      .expect(201);

    return response.body.data.postId as string;
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

  describe('reactions (PRD §9)', () => {
    it('allows several different reactions but not the same one twice', async () => {
      const author = await user();
      const reader = await user();
      const postId = await postBy(author.token);

      await http
        .put(`/v1/posts/${postId}/reactions`)
        .set('authorization', `Bearer ${reader.token}`)
        .send({ type: 'aku_ngerti' })
        .expect(200);

      const second = await http
        .put(`/v1/posts/${postId}/reactions`)
        .set('authorization', `Bearer ${reader.token}`)
        .send({ type: 'peluk_virtual' })
        .expect(200);

      expect(second.body.data.mine.sort()).toEqual(['aku_ngerti', 'peluk_virtual']);
      expect(second.body.data.counts.aku_ngerti).toBe(1);

      // Re-sending the same reaction is idempotent, not an error.
      const repeat = await http
        .put(`/v1/posts/${postId}/reactions`)
        .set('authorization', `Bearer ${reader.token}`)
        .send({ type: 'aku_ngerti' })
        .expect(200);

      expect(repeat.body.data.counts.aku_ngerti).toBe(1);
    });

    it('does not count a reaction as a response', async () => {
      // A post with twelve taps and no words has not been answered. Counting
      // reactions would bury exactly the posts that still need a human reply.
      const author = await user();
      const reader = await user();
      const postId = await postBy(author.token);

      await http
        .put(`/v1/posts/${postId}/reactions`)
        .set('authorization', `Bearer ${reader.token}`)
        .send({ type: 'aku_dengerin' })
        .expect(200);

      const post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.responseCount).toBe(0);
    });

    it('refuses a reaction on a post the user cannot see', async () => {
      const author = await user();
      const blocker = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/users/${author.alias}/block`)
        .set('authorization', `Bearer ${blocker.token}`)
        .expect(201);

      await http
        .put(`/v1/posts/${postId}/reactions`)
        .set('authorization', `Bearer ${blocker.token}`)
        .send({ type: 'aku_ngerti' })
        .expect(404);
    });
  });

  describe('comments (PRD §9)', () => {
    it('accepts a reply but refuses a reply to a reply', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      const top = await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku ngerti banget rasanya.' })
        .expect(201);

      const reply = await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${author.token}`)
        .send({ body: 'Makasih ya.', parentId: top.body.data.id })
        .expect(201);

      const tooDeep = await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Sama-sama.', parentId: reply.body.data.id });

      expect(tooDeep.status).toBe(400);
      expect(tooDeep.body.error.code).toBe('COMMENT_NESTING_TOO_DEEP');
    });

    it('refuses comments when the author locked them', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .patch(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .send({ allowComments: false })
        .expect(200);

      const blocked = await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Semangat ya!' });

      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('COMMENTS_LOCKED');
    });

    it('keeps existing comments when the author locks the thread', async () => {
      // Locking stops new replies; it does not erase the people who already
      // responded.
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku dengerin kok.' })
        .expect(201);

      await http
        .patch(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .send({ allowComments: false })
        .expect(200);

      const listed = await http
        .get(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(listed.body.data.items).toHaveLength(1);
    });

    it('only lets the post author mark a comment helpful', async () => {
      const author = await user();
      const responder = await user();
      const stranger = await user();
      const postId = await postBy(author.token);

      const comment = await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku pernah di posisi kamu.' })
        .expect(201);

      await http
        .post(`/v1/comments/${comment.body.data.id}/helpful`)
        .set('authorization', `Bearer ${stranger.token}`)
        .send({ helpful: true })
        .expect(403);

      await http
        .post(`/v1/comments/${comment.body.data.id}/helpful`)
        .set('authorization', `Bearer ${author.token}`)
        .send({ helpful: true })
        .expect(201);

      const profile = await prisma.userProfile.findUniqueOrThrow({
        where: { userId: responder.userId },
      });
      expect(profile.helpfulCount).toBe(1);
    });
  });

  describe('response_count (TECH-SPEC §4.7)', () => {
    it('counts other people’s comments but not the author’s own', async () => {
      // Replying to yourself is not being heard.
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${author.token}`)
        .send({ body: 'Nambahin sedikit soal tadi.' })
        .expect(201);

      let post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.responseCount).toBe(0);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku dengerin ya.' })
        .expect(201);

      post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.responseCount).toBe(1);
    });

    it('stays exact under concurrent comments', async () => {
      // Read-modify-write would lose increments here, and a wrong count means
      // answered posts keep asking for help in "Butuh Didengar".
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          http
            .post(`/v1/posts/${postId}/comments`)
            .set('authorization', `Bearer ${responder.token}`)
            .send({ body: `Balasan bersamaan nomor ${i}.` }),
        ),
      );

      const post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.responseCount).toBe(20);
    });

    it('decrements when a comment is deleted', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      const comment = await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Semangat ya.' })
        .expect(201);

      await http
        .delete(`/v1/comments/${comment.body.data.id}`)
        .set('authorization', `Bearer ${responder.token}`)
        .expect(200);

      const post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.responseCount).toBe(0);
    });
  });

  describe('Felt Heard anti-fatigue (PRD §9)', () => {
    it('creates at most one prompt per post no matter how many replies arrive', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      for (let i = 0; i < 4; i++) {
        await http
          .post(`/v1/posts/${postId}/comments`)
          .set('authorization', `Bearer ${responder.token}`)
          .send({ body: `Balasan ke-${i}, aku dengerin kok.` })
          .expect(201);
      }

      const prompts = await prisma.feltHeardPrompt.count({
        where: { userId: author.userId, targetType: 'post', targetId: postId },
      });

      expect(prompts).toBe(1);
    });

    it('survives concurrent replies without failing the comment', async () => {
      // Several replies landing at once can all pass the "already prompted?"
      // check. Losing that race must not surface as an error on someone's
      // comment — they wrote a reply, and a prompt they never see is not their
      // problem.
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          http
            .post(`/v1/posts/${postId}/comments`)
            .set('authorization', `Bearer ${responder.token}`)
            .send({ body: `Balasan bersamaan Felt Heard nomor ${i}.` }),
        ),
      );

      for (const response of responses) {
        expect(response.status, 'a comment failed because of a prompt race').toBe(201);
      }

      const prompts = await prisma.feltHeardPrompt.count({
        where: { userId: author.userId, targetType: 'post', targetId: postId },
      });
      expect(prompts).toBe(1);
    });

    it('caps prompts per day', async () => {
      const author = await user();
      const responder = await user();

      // Five separate posts, each answered — but the daily cap is 3.
      for (let i = 0; i < 5; i++) {
        const postId = await postBy(author.token);
        await http
          .post(`/v1/posts/${postId}/comments`)
          .set('authorization', `Bearer ${responder.token}`)
          .send({ body: `Aku dengerin curhat nomor ${i}.` })
          .expect(201);
      }

      const prompts = await prisma.feltHeardPrompt.count({ where: { userId: author.userId } });
      expect(prompts).toBeLessThanOrEqual(3);
    });

    it('holds the prompt back until the delay has passed', async () => {
      // Asking in the same second the reply lands means asking before the
      // author has read it.
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku di sini kok.' })
        .expect(201);

      const pending = await http
        .get('/v1/me/felt-heard/pending')
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(pending.body.data).toHaveLength(0);
    });

    it('creates no prompt when the user switched it off', async () => {
      const author = await user();
      const responder = await user();

      await http
        .patch('/v1/me/notification-settings')
        .set('authorization', `Bearer ${author.token}`)
        .send({ feltHeardPromptEnabled: false })
        .expect(200);

      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku dengerin ya.' })
        .expect(201);

      const prompts = await prisma.feltHeardPrompt.count({ where: { userId: author.userId } });
      expect(prompts).toBe(0);
    });
  });

  describe('Felt Heard Rate (PRD §19.1)', () => {
    it('excludes dismissed prompts from the denominator', async () => {
      // This is the property that keeps the North Star meaningful. Counting a
      // dismissal as "no" would make the metric measure annoyance instead.
      const feltHeard = app.get(FeltHeardService);
      const author = await user();

      const category = await prisma.postCategory.findFirstOrThrow();
      const targets = await Promise.all(
        Array.from({ length: 4 }, () =>
          prisma.curhatPost.create({
            data: {
              authorId: author.userId,
              categoryId: category.id,
              body: 'uji felt heard rate',
              mood: 'lega',
              intent: 'cuma_didengar',
              status: 'published',
              safetyLevel: 'L1',
            },
          }),
        ),
      );

      const answers = ['yes', 'somewhat', 'no'] as const;
      for (const [index, target] of targets.entries()) {
        const prompt = await prisma.feltHeardPrompt.create({
          data: { userId: author.userId, targetType: 'post', targetId: target.id },
        });

        if (index < 3) {
          await feltHeard.answer(author.userId, prompt.id, answers[index] as 'yes');
        } else {
          await feltHeard.dismiss(author.userId, prompt.id);
        }
      }

      const since = new Date(Date.now() - 60_000);
      const rate = await feltHeard.rate({ since });

      // 3 answered (yes, somewhat, no) → 2/3. The dismissal is reported but
      // never divided by.
      expect(rate.answered).toBe(3);
      expect(rate.dismissed).toBe(1);
      expect(rate.rate).toBeCloseTo(2 / 3);
    });

    it('reports null rather than zero when nobody has answered', async () => {
      // "No data" and "nobody felt heard" are very different things to put on
      // a dashboard.
      const feltHeard = app.get(FeltHeardService);
      const rate = await feltHeard.rate({ since: new Date(Date.now() + 60_000) });
      expect(rate.rate).toBeNull();
    });

    it('refuses to dismiss a prompt that was already answered', async () => {
      const feltHeard = app.get(FeltHeardService);
      const author = await user();
      const category = await prisma.postCategory.findFirstOrThrow();

      const post = await prisma.curhatPost.create({
        data: {
          authorId: author.userId,
          categoryId: category.id,
          body: 'uji',
          mood: 'lega',
          intent: 'cuma_didengar',
          status: 'published',
          safetyLevel: 'L1',
        },
      });

      const prompt = await prisma.feltHeardPrompt.create({
        data: { userId: author.userId, targetType: 'post', targetId: post.id },
      });

      await feltHeard.answer(author.userId, prompt.id, 'yes');
      await expect(feltHeard.dismiss(author.userId, prompt.id)).rejects.toThrow();
    });
  });

  describe('reports (PRD §15)', () => {
    it('sends threats straight to the Critical queue', async () => {
      const author = await user();
      const reporter = await user();
      const postId = await postBy(author.token);

      await http
        .post('/v1/reports')
        .set('authorization', `Bearer ${reporter.token}`)
        .send({ targetType: 'post', targetId: postId, category: 'threat' })
        .expect(201);

      const moderationCase = await prisma.moderationCase.findFirstOrThrow({
        where: { targetType: 'post', targetId: postId },
      });
      expect(moderationCase.queue).toBe('critical');
    });

    it('puts spam in the Low queue', async () => {
      const author = await user();
      const reporter = await user();
      const postId = await postBy(author.token);

      await http
        .post('/v1/reports')
        .set('authorization', `Bearer ${reporter.token}`)
        .send({ targetType: 'post', targetId: postId, category: 'spam' })
        .expect(201);

      const moderationCase = await prisma.moderationCase.findFirstOrThrow({
        where: { targetType: 'post', targetId: postId },
      });
      expect(moderationCase.queue).toBe('low');
    });

    it('escalates an existing case but never downgrades it', async () => {
      const author = await user();
      const first = await user();
      const second = await user();
      const postId = await postBy(author.token);

      await http
        .post('/v1/reports')
        .set('authorization', `Bearer ${first.token}`)
        .send({ targetType: 'post', targetId: postId, category: 'threat' })
        .expect(201);

      await http
        .post('/v1/reports')
        .set('authorization', `Bearer ${second.token}`)
        .send({ targetType: 'post', targetId: postId, category: 'spam' })
        .expect(201);

      const cases = await prisma.moderationCase.findMany({
        where: { targetType: 'post', targetId: postId },
      });

      // One case, weight raised — ten reports about one post is one problem.
      expect(cases).toHaveLength(1);
      expect(cases[0]?.queue).toBe('critical');
      expect(cases[0]?.reportCount).toBe(2);
    });

    it('tells the reporter nothing about the outcome', async () => {
      // Confirming an outcome would let reports probe whether someone has been
      // actioned.
      const author = await user();
      const reporter = await user();
      const postId = await postBy(author.token);

      const response = await http
        .post('/v1/reports')
        .set('authorization', `Bearer ${reporter.token}`)
        .send({ targetType: 'post', targetId: postId, category: 'harassment' })
        .expect(201);

      expect(response.body.data).toEqual({
        status: 'received',
        message: 'Laporanmu kami terima.',
      });
    });
  });
});
