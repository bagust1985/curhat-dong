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

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const CONSENTS = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

/** A rare token, so a match can only have come from the post under test. */
function rareWord(): string {
  return `zunpakwe${Math.trunc(Math.random() * 1e9)}`;
}

describeDb('search (E13)', () => {
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

    return { token, userId: account.userId, alias: onboarded.body.data.alias as string };
  }

  async function postBy(
    token: string,
    body: string,
    options: { anonymous?: boolean } = {},
  ): Promise<string> {
    const response = await http
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        body,
        categorySlug: 'work',
        mood: 'capek',
        intent: 'cuma_didengar',
        ...(options.anonymous ? { anonymityMode: 'anonymous' } : {}),
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

  // -------------------------------------------------------------------------
  // E13-T01 — what is indexed, and what is not
  // -------------------------------------------------------------------------

  describe('index scope (E13-T01)', () => {
    it('finds a published post by a word in its body', async () => {
      const author = await user();
      const word = rareWord();
      const postId = await postBy(author.token, `Kerjaan lagi berat dan ${word} banget rasanya.`);

      const response = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(response.body.data.posts.map((p: { id: string }) => p.id)).toContain(postId);
    });

    it('never returns a held post', async () => {
      // Held content must not surface through search even though its row
      // exists. The GIN index is partial on status='published' (E02-T08), and
      // the query filters for it as well.
      const author = await user();
      const word = rareWord();
      const postId = await postBy(author.token, `Hari ini ${word} sekali rasanya.`);

      await prisma.curhatPost.update({ where: { id: postId }, data: { status: 'held' } });

      const response = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(response.body.data.posts).toHaveLength(0);
    });

    it('follows a post back into and out of the index as its status changes', async () => {
      const author = await user();
      const word = rareWord();
      const postId = await postBy(author.token, `Cerita soal ${word} yang bikin lelah.`);

      await prisma.curhatPost.update({ where: { id: postId }, data: { status: 'removed' } });
      const removed = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);
      expect(removed.body.data.posts).toHaveLength(0);

      await prisma.curhatPost.update({ where: { id: postId }, data: { status: 'published' } });
      const restored = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);
      expect(restored.body.data.posts).toHaveLength(1);
    });

    it('finds a suffixed word from its base form', async () => {
      // The acceptance criterion: "kesepian" must find "kesepiannya".
      const author = await user();
      const word = rareWord();
      const postId = await postBy(author.token, `Rasanya ${word}nya nggak hilang-hilang.`);

      const response = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(response.body.data.posts.map((p: { id: string }) => p.id)).toContain(postId);
    });

    it('finds a base word from a circumfixed query', async () => {
      // The other direction: a reader searching "kesepian" is looking for the
      // post that only ever said "sepi". Prefix matching cannot do this; the
      // query layer strips the affixes.
      const author = await user();
      const stem = rareWord();
      const postId = await postBy(author.token, `Aku cuma ${stem} aja hari ini.`);

      const response = await http
        .get(`/v1/search?q=ke${stem}an`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(response.body.data.posts.map((p: { id: string }) => p.id)).toContain(postId);
    });

    it('requires every word of a multi-word query', async () => {
      const author = await user();
      const [a, b] = [rareWord(), rareWord()];
      await postBy(author.token, `Cerita tentang ${a} saja hari ini.`);

      const both = await http
        .get(`/v1/search?q=${a}+${b}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(both.body.data.posts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // E13-T02 — the endpoint
  // -------------------------------------------------------------------------

  describe('endpoint (E13-T02)', () => {
    it('hides posts by someone the viewer blocked, in both directions', async () => {
      const author = await user();
      const reader = await user();
      const word = rareWord();
      await postBy(author.token, `Soal ${word} yang bikin capek.`);

      const before = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);
      expect(before.body.data.posts).toHaveLength(1);

      await prisma.blockedUser.create({
        data: { blockerId: reader.userId, blockedId: author.userId },
      });

      const afterBlocker = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);
      expect(afterBlocker.body.data.posts).toHaveLength(0);

      // And the person who was blocked cannot find the blocker's posts either.
      const otherWord = rareWord();
      await postBy(reader.token, `Catatan soal ${otherWord}.`);

      const afterBlocked = await http
        .get(`/v1/search?q=${otherWord}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);
      expect(afterBlocked.body.data.posts).toHaveLength(0);
    });

    it('returns an empty page for a query with no searchable words', async () => {
      const reader = await user();

      const response = await http
        .get('/v1/search?q=%21%21%21')
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(response.body.data.posts).toHaveLength(0);
      expect(response.body.data.nextCursor).toBeNull();
    });

    it('survives a query full of tsquery operators', async () => {
      // Unescaped, these are `to_tsquery` syntax: a stray parenthesis is a
      // Postgres syntax error, which would be a 500 for whoever typed it.
      const reader = await user();

      for (const hostile of ["capek & !kerja", "(banget):*", "a <-> b", "'x'"]) {
        await http
          .get(`/v1/search?q=${encodeURIComponent(hostile)}`)
          .set('authorization', `Bearer ${reader.token}`)
          .expect(200);
      }
    });

    it('pages with a cursor without repeating a result', async () => {
      const author = await user();
      const word = rareWord();

      for (let i = 0; i < 5; i += 1) {
        await postBy(author.token, `Catatan ke-${i} tentang ${word} hari ini.`);
      }

      const first = await http
        .get(`/v1/search?q=${word}&limit=2`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(first.body.data.posts).toHaveLength(2);
      expect(first.body.data.nextCursor).toBeTruthy();

      const second = await http
        .get(`/v1/search?q=${word}&limit=2&cursor=${first.body.data.nextCursor as string}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      const firstIds = first.body.data.posts.map((p: { id: string }) => p.id);
      const secondIds = second.body.data.posts.map((p: { id: string }) => p.id);

      expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
    });

    it('restarts from the top on a broken cursor', async () => {
      const author = await user();
      const word = rareWord();
      await postBy(author.token, `Satu catatan soal ${word}.`);

      const response = await http
        .get(`/v1/search?q=${word}&cursor=bukan-cursor`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(response.body.data.posts).toHaveLength(1);
    });

    it('rejects a query that is missing or too long', async () => {
      const reader = await user();

      await http
        .get('/v1/search')
        .set('authorization', `Bearer ${reader.token}`)
        .expect(400);

      await http
        .get(`/v1/search?q=${'a'.repeat(200)}`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(400);
    });

    it('needs authentication', async () => {
      // Search reaches curhat, and curhat is not public (non-negotiable #5).
      await http.get('/v1/search?q=capek').expect(401);
    });

    it('rate limits to keep search from becoming a scraper', async () => {
      const reader = await user();
      const perMinute = 30;

      let limited = false;
      for (let i = 0; i < perMinute + 5; i += 1) {
        const response = await http
          .get(`/v1/search?q=capek${i}`)
          .set('authorization', `Bearer ${reader.token}`);

        if (response.status === 429) {
          limited = true;
          expect(response.body.error.code).toBe('RATE_LIMITED');
          break;
        }
      }

      expect(limited).toBe(true);
    });

    it('returns only public-safe fields for a listener', async () => {
      const listener = await user();
      const reader = await user();

      await prisma.userProfile.update({
        where: { userId: listener.userId },
        data: { isListener: true },
      });
      await prisma.listenerProfile.create({
        data: {
          userId: listener.userId,
          topics: ['work'],
          guidelinesVersionAccepted: 'v1',
          guidelinesAcceptedAt: new Date(),
        },
      });

      const response = await http
        .get(`/v1/search?q=${listener.alias}&tab=listener`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      const found = response.body.data.listeners[0];
      expect(found.alias).toBe(listener.alias);

      // The allow-list from PRD §16, and nothing beyond it.
      expect(Object.keys(found).sort()).toEqual(
        ['alias', 'avatar', 'bio', 'helpfulCount', 'isAvailable', 'joinedAt', 'topics'].sort(),
      );
      expect(JSON.stringify(found)).not.toContain(listener.userId);
    });

    it('does not return the searcher in their own listener results', async () => {
      const listener = await user();

      await prisma.userProfile.update({
        where: { userId: listener.userId },
        data: { isListener: true },
      });

      const response = await http
        .get(`/v1/search?q=${listener.alias}&tab=listener`)
        .set('authorization', `Bearer ${listener.token}`)
        .expect(200);

      expect(response.body.data.listeners).toHaveLength(0);
    });

    it('finds a topic by name', async () => {
      const reader = await user();

      const response = await http
        .get('/v1/search?q=kerjaan&tab=topik')
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(response.body.data.topics.map((t: { slug: string }) => t.slug)).toContain('work');
    });
  });

  // -------------------------------------------------------------------------
  // E13-T03 — privacy boundaries
  // -------------------------------------------------------------------------

  describe('privacy (E13-T03)', () => {
    it('never finds a private room message', async () => {
      const requester = await user();
      const listener = await user();
      const secret = rareWord();

      const room = await prisma.chatRoom.create({ data: { type: 'listener_session' } });
      await prisma.roomMember.createMany({
        data: [
          { roomId: room.id, userId: requester.userId, role: 'requester' },
          { roomId: room.id, userId: listener.userId, role: 'listener' },
        ],
      });
      await prisma.message.create({
        data: {
          roomId: room.id,
          senderId: requester.userId,
          body: `Sebenarnya aku ${secret} banget selama ini.`,
        },
      });

      for (const tab of ['curhat', 'listener', 'topik']) {
        const response = await http
          .get(`/v1/search?q=${secret}&tab=${tab}`)
          .set('authorization', `Bearer ${requester.token}`)
          .expect(200);

        expect(response.body.data.posts, tab).toHaveLength(0);
        expect(response.body.data.listeners, tab).toHaveLength(0);
        expect(response.body.data.topics, tab).toHaveLength(0);
      }
    });

    it('never finds a DONG AI message', async () => {
      const person = await user();
      const secret = rareWord();

      const conversation = await prisma.aiConversation.create({
        data: { userId: person.userId, personalityMode: 'pendengar' },
      });
      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          body: `Aku ${secret} dan nggak tau harus gimana.`,
        },
      });

      const response = await http
        .get(`/v1/search?q=${secret}`)
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(response.body.data.posts).toHaveLength(0);
    });

    it('cannot be used to tie two anonymous posts to one account', async () => {
      // The display code is random per post (E04-T04). If search returned the
      // author id — or a stable per-user code — reading the results would
      // group somebody's whole anonymous history in one step.
      const author = await user();
      const word = rareWord();

      await postBy(author.token, `Pertama soal ${word}.`, { anonymous: true });
      await postBy(author.token, `Kedua soal ${word}.`, { anonymous: true });

      const reader = await user();
      const response = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      const posts = response.body.data.posts as Array<{
        authorAlias: string;
        isAnonymous: boolean;
      }>;

      expect(posts).toHaveLength(2);
      expect(posts.every((post) => post.isAnonymous)).toBe(true);
      expect(posts[0]?.authorAlias).not.toBe(posts[1]?.authorAlias);
      expect(JSON.stringify(posts)).not.toContain(author.userId);
      expect(JSON.stringify(posts)).not.toContain(author.alias);
    });

    it('marks the results noindex', async () => {
      const reader = await user();

      const response = await http
        .get('/v1/search?q=capek')
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(response.headers['x-robots-tag']).toContain('noindex');
    });

    it('returns an excerpt, not the whole curhat', async () => {
      const author = await user();
      const word = rareWord();
      const long = `${word} ${'panjang sekali ceritanya. '.repeat(40)}`;
      await postBy(author.token, long);

      const response = await http
        .get(`/v1/search?q=${word}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      const excerpt = response.body.data.posts[0].excerpt as string;
      expect(excerpt.length).toBeLessThan(long.length);
      expect(excerpt.endsWith('…')).toBe(true);
    });
  });
});
