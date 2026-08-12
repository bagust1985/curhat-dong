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

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const CONSENTS = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

const CURHAT_BODY = 'Aku capek banget dan nggak tau harus cerita ke siapa lagi soal ini.';

describeDb('admin management (E14-T08 to T11)', () => {
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
  const createdCategoryIds: string[] = [];

  async function clearCaches(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:*')),
      ...(await redis.keys('ratelimit:*')),
      ...(await redis.keys('agegate:*')),
      ...(await redis.keys('admin:mfa:*')),
      ...(await redis.keys('categories:*')),
      ...(await redis.keys('feed:*')),
    ];
    if (keys.length > 0) await redis.del(...keys);
  }

  async function user(): Promise<{ token: string; userId: string; email: string; alias: string }> {
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

    return {
      token,
      userId: account.userId,
      email,
      alias: onboarded.body.data.alias as string,
    };
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

  async function postBy(token: string): Promise<string> {
    const response = await http
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        body: CURHAT_BODY,
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
    // Users first: a category cannot be deleted while a post still references
    // it (`curhat_posts_category_id_fkey` restricts), and deleting the users
    // cascades their posts away.
    if (createdUserIds.length > 0) {
      await prisma.moderationAction.deleteMany({
        where: { moderatorId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdCategoryIds.length > 0) {
      await prisma.postCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    }
    await clearCaches();
    await app.close();
  });

  // -------------------------------------------------------------------------
  // E14-T08 — user management
  // -------------------------------------------------------------------------

  describe('user management (E14-T08)', () => {
    it('finds an account by alias', async () => {
      const support = await admin('customer_support');
      const subject = await user();

      const response = await http
        .get(`/v1/admin/users?query=${subject.alias}`)
        .set('authorization', `Bearer ${support.token}`)
        .expect(200);

      expect((response.body.data as Array<{ userId: string }>).map((u) => u.userId)).toContain(
        subject.userId,
      );
    });

    it('finds an account by email without ever storing the address', async () => {
      // The acceptance criterion: search uses the email *hash*. Plaintext email
      // is not stored at all (TECH-SPEC §7.5), so this works only because the
      // server hashes the input with the same key the auth flow uses.
      const support = await admin('customer_support');
      const subject = await user();

      const response = await http
        .get(`/v1/admin/users?query=${encodeURIComponent(subject.email)}`)
        .set('authorization', `Bearer ${support.token}`)
        .expect(200);

      const found = response.body.data as Array<{ userId: string }>;
      expect(found.map((u) => u.userId)).toContain(subject.userId);

      // And the response says nothing about the address.
      expect(JSON.stringify(response.body)).not.toContain(subject.email);

      const stored = await prisma.authAccount.findFirstOrThrow({
        where: { userId: subject.userId },
      });
      expect(stored.emailHash).not.toBe(subject.email);
      expect(stored.emailHash).toBe(hashEmail(subject.email, key));
    });

    it('shows the internal trust score to an admin and never on a public API', async () => {
      const support = await admin('customer_support');
      const subject = await user();

      const detail = await http
        .get(`/v1/admin/users/${subject.userId}`)
        .set('authorization', `Bearer ${support.token}`)
        .expect(200);

      expect(typeof detail.body.data.trustScore).toBe('number');

      // The same account through the public profile endpoint: no score.
      const publicView = await http
        .get(`/v1/users/${subject.alias}`)
        .set('authorization', `Bearer ${subject.token}`)
        .expect(200);

      expect(JSON.stringify(publicView.body)).not.toContain('trustScore');
      expect(JSON.stringify(publicView.body)).not.toContain('trust_score');
    });

    it('never exposes a push token on the user detail', async () => {
      const support = await admin('customer_support');
      const subject = await user();

      await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${subject.token}`)
        .send({
          deviceId: 'handset-admin-view',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: 'ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]',
        })
        .expect(201);

      const detail = await http
        .get(`/v1/admin/users/${subject.userId}`)
        .set('authorization', `Bearer ${support.token}`)
        .expect(200);

      expect(detail.body.data.devices).toHaveLength(1);
      expect(JSON.stringify(detail.body)).not.toContain('ExponentPushToken');
      expect(JSON.stringify(detail.body)).not.toContain('pushTokenEncrypted');
    });

    it('audits opening an account record', async () => {
      const support = await admin('customer_support');
      const subject = await user();

      await http
        .get(`/v1/admin/users/${subject.userId}`)
        .set('authorization', `Bearer ${support.token}`)
        .expect(200);

      const viewed = await prisma.auditLog.findFirst({
        where: {
          actorId: support.userId,
          action: 'admin.user.viewed',
          targetId: subject.userId,
        },
      });
      expect(viewed).not.toBeNull();
    });

    it('refuses an account action to Customer Support', async () => {
      // Support can look, to answer a ticket. Acting on an account is a
      // moderator decision (E14-T02).
      const support = await admin('customer_support');
      const subject = await user();

      await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${support.token}`)
        .send({ action: 'ban', reason: 'Melanggar berulang kali setelah peringatan.' })
        .expect(403);
    });

    it('suspends an account, revokes its sessions and audits it', async () => {
      const moderator = await admin('moderator');
      const subject = await user();

      const response = await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({
          action: 'suspend',
          reason: 'Mengirim pesan mengancam ke beberapa orang.',
          durationHours: 72,
        })
        .expect(201);

      expect(response.body.data.status).toBe('suspended');

      // A suspension that waits for a token to expire is not a suspension.
      const live = await prisma.userSession.count({
        where: { userId: subject.userId, revokedAt: null },
      });
      expect(live).toBe(0);

      const audited = await prisma.auditLog.findFirst({
        where: { actorId: moderator.userId, action: 'admin.user.suspend' },
      });
      expect(audited).not.toBeNull();
      expect((audited?.diff as { to: string }).to).toBe('suspended');
    });

    it('refuses an action with no usable reason or no duration', async () => {
      const moderator = await admin('moderator');
      const subject = await user();

      await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'ban', reason: 'spam' })
        .expect(400);

      await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'mute', reason: 'Berulang kali mengirim tautan penipuan.' })
        .expect(400);
    });

    it('leaves the account active for a warning', async () => {
      // A warning is recorded and shown; it changes no state. Making it a
      // status would turn "we told you" into a punishment nobody applied.
      const moderator = await admin('moderator');
      const subject = await user();

      await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'warn', reason: 'Bahasanya kasar di kolom komentar.' })
        .expect(201);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: subject.userId } });
      expect(after.status).toBe('active');
    });

    it('unbans back to active', async () => {
      const moderator = await admin('moderator');
      const subject = await user();

      await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'ban', reason: 'Penipuan berulang terhadap beberapa user.' })
        .expect(201);

      const restored = await http
        .post(`/v1/admin/users/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'unban', reason: 'Banding diterima, keputusan awal keliru.' })
        .expect(201);

      expect(restored.body.data.status).toBe('active');
    });
  });

  // -------------------------------------------------------------------------
  // E14-T09 — content management
  // -------------------------------------------------------------------------

  describe('content management (E14-T09)', () => {
    it('removes and restores a post, keeping every comment', async () => {
      // The acceptance criterion: remove → restore leaves the post published
      // with its comments intact.
      const moderator = await admin('moderator');
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku ngerti banget rasanya, semangat ya.' })
        .expect(201);

      await http
        .post(`/v1/admin/content/posts/${postId}/remove`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ reason: 'Awalnya terlihat melanggar pedoman doxxing.' })
        .expect(201);

      expect(
        (await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } })).status,
      ).toBe('removed');

      const restored = await http
        .post(`/v1/admin/content/posts/${postId}/restore`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ reason: 'Setelah ditinjau ulang, tidak ada pelanggaran.' })
        .expect(201);

      expect(restored.body.data.status).toBe('published');

      // Comments were never deleted, so the thread comes back whole. A removal
      // that destroyed it would make "restore" a word for something that
      // cannot happen.
      const comments = await prisma.comment.count({ where: { postId, status: 'published' } });
      expect(comments).toBe(1);
    });

    it('locks a thread without deleting what is already there', async () => {
      const moderator = await admin('moderator');
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Sudah pernah di posisi yang sama, kamu nggak sendirian.' })
        .expect(201);

      const locked = await http
        .patch(`/v1/admin/content/posts/${postId}/comments`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ allowComments: false, reason: 'Diskusinya mulai menyerang pribadi.' })
        .expect(200);

      expect(locked.body.data.allowComments).toBe(false);
      // Locking is "no more of this", not "none of this happened" — deleting
      // would erase the support the author already got.
      expect(locked.body.data.commentsKept).toBe(1);

      // And a new comment is refused.
      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Mau nambahin satu hal lagi soal ini.' })
        .expect(403);
    });

    it('refuses to restore a post that was never removed', async () => {
      const moderator = await admin('moderator');
      const author = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/admin/content/posts/${postId}/restore`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ reason: 'Mencoba memulihkan yang tidak pernah dihapus.' })
        .expect(409);
    });

    it('filters the list by status', async () => {
      const moderator = await admin('moderator');
      const author = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/admin/content/posts/${postId}/remove`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ reason: 'Melanggar pedoman komunitas soal spam.' })
        .expect(201);

      const response = await http
        .get('/v1/admin/content/posts?status=removed&limit=100')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const ids = (response.body.data.items as Array<{ postId: string }>).map((p) => p.postId);
      expect(ids).toContain(postId);
    });

    it('hides the alias of an anonymous post but keeps the author actionable', async () => {
      const moderator = await admin('moderator');
      const author = await user();

      const created = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send({
          body: CURHAT_BODY,
          categorySlug: 'work',
          mood: 'capek',
          intent: 'cuma_didengar',
          anonymityMode: 'anonymous',
        })
        .expect(201);

      const postId = created.body.data.postId as string;

      const response = await http
        .get('/v1/admin/content/posts?limit=100')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const found = (
        response.body.data.items as Array<{
          postId: string;
          authorAlias: string | null;
          isAnonymous: boolean;
          authorId: string;
        }>
      ).find((post) => post.postId === postId);

      expect(found?.isAnonymous).toBe(true);
      expect(found?.authorAlias).toBeNull();
      // The id is present because a moderator acting on content has to be able
      // to act on the account behind it. It never reaches a public response.
      expect(found?.authorId).toBe(author.userId);
    });

    it('refuses content moderation to Content Manager', async () => {
      const manager = await admin('content_manager');
      const author = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/admin/content/posts/${postId}/remove`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ reason: 'Mencoba menghapus tanpa izin moderasi.' })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // E14-T10 — listener management
  // -------------------------------------------------------------------------

  describe('listener management (E14-T10)', () => {
    async function listener(): Promise<{ userId: string; token: string }> {
      const account = await user();

      await prisma.userProfile.update({
        where: { userId: account.userId },
        data: { isListener: true },
      });
      await prisma.listenerProfile.create({
        data: {
          userId: account.userId,
          guidelinesVersionAccepted: 'v1',
          guidelinesAcceptedAt: new Date(),
        },
      });
      await prisma.listenerAvailability.create({
        data: { userId: account.userId, isAvailable: true },
      });

      return { userId: account.userId, token: account.token };
    }

    it('lists listeners with rates rather than a leaderboard', async () => {
      const moderator = await admin('moderator');
      const subject = await listener();

      const response = await http
        .get('/v1/admin/listeners?limit=100')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const found = (response.body.data as Array<{ userId: string; feltHeardRate: number }>).find(
        (row) => row.userId === subject.userId,
      );

      expect(found).toBeTruthy();
      // Rates over 0..1, for the same reason ranking uses them (E10-T06):
      // counts turn a support role into a contest.
      expect(found?.feltHeardRate).toBeGreaterThanOrEqual(0);
      expect(found?.feltHeardRate).toBeLessThanOrEqual(1);
    });

    it('suspends listener mode without banning the account', async () => {
      // The acceptance criterion, and the point of the whole service: somebody
      // who has absorbed too much is not somebody to remove from a product
      // about not being alone.
      const moderator = await admin('moderator');
      const subject = await listener();

      const response = await http
        .post(`/v1/admin/listeners/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'suspend', reason: 'Beberapa laporan soal nada bicara di sesi.' })
        .expect(201);

      expect(response.body.data.safetyStatus).toBe('suspended');

      const account = await prisma.user.findUniqueOrThrow({ where: { id: subject.userId } });
      expect(account.status).toBe('active');

      // They can still use the product as a user.
      await http
        .get('/v1/me')
        .set('authorization', `Bearer ${subject.token}`)
        .expect(200);
    });

    it('closes an open session politely instead of dropping it', async () => {
      const moderator = await admin('moderator');
      const subject = await listener();
      const requester = await user();

      const room = await prisma.chatRoom.create({ data: { type: 'listener_session' } });
      await prisma.roomMember.createMany({
        data: [
          { roomId: room.id, userId: requester.userId, role: 'requester' },
          { roomId: room.id, userId: subject.userId, role: 'listener' },
        ],
      });
      const request_ = await prisma.listenerRequest.create({
        data: { requesterId: requester.userId, topic: 'work', emotion: 'capek', status: 'matched' },
      });
      const match = await prisma.listenerMatch.create({
        data: {
          requestId: request_.id,
          requesterId: requester.userId,
          listenerId: subject.userId,
          status: 'accepted',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await prisma.listenerSession.create({
        data: {
          matchId: match.id,
          roomId: room.id,
          requesterId: requester.userId,
          listenerId: subject.userId,
        },
      });

      const response = await http
        .post(`/v1/admin/listeners/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'suspend', reason: 'Perlu dihentikan sementara sambil ditinjau.' })
        .expect(201);

      expect(response.body.data.sessionsClosed).toBe(1);

      const closed = await prisma.chatRoom.findUniqueOrThrow({ where: { id: room.id } });
      expect(closed.status).toBe('closed');

      const session = await prisma.listenerSession.findFirstOrThrow({
        where: { roomId: room.id },
      });
      expect(session.endedAt).not.toBeNull();
      expect(session.endReason).toBe('moderation');
    });

    it('does not switch availability back on when restoring', async () => {
      // Coming back is theirs to decide. A listener silently made available
      // again would start receiving offers they never asked for.
      const moderator = await admin('moderator');
      const subject = await listener();

      await http
        .post(`/v1/admin/listeners/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'suspend', reason: 'Ditinjau setelah beberapa laporan masuk.' })
        .expect(201);

      await http
        .post(`/v1/admin/listeners/${subject.userId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'restore', reason: 'Peninjauan selesai, tidak ada pelanggaran.' })
        .expect(201);

      const profile = await prisma.listenerProfile.findUniqueOrThrow({
        where: { userId: subject.userId },
      });
      expect(profile.safetyStatus).toBe('ok');

      const availability = await prisma.listenerAvailability.findUnique({
        where: { userId: subject.userId },
      });
      expect(availability?.isAvailable).toBe(false);
    });

    it('refuses listener suspension to Customer Support', async () => {
      const support = await admin('customer_support');
      const subject = await listener();

      await http
        .post(`/v1/admin/listeners/${subject.userId}/actions`)
        .set('authorization', `Bearer ${support.token}`)
        .send({ action: 'suspend', reason: 'Mencoba menangguhkan tanpa izin.' })
        .expect(403);
    });
  });

  // -------------------------------------------------------------------------
  // E14-T11 — category management
  // -------------------------------------------------------------------------

  describe('category management (E14-T11)', () => {
    async function createCategory(
      token: string,
      slug: string,
    ): Promise<{ id: string; slug: string }> {
      const response = await http
        .post('/v1/admin/categories')
        .set('authorization', `Bearer ${token}`)
        .send({ slug, name: 'Kategori Uji', icon: 'sparkle' })
        .expect(201);

      createdCategoryIds.push(response.body.data.id as string);
      return { id: response.body.data.id as string, slug: response.body.data.slug as string };
    }

    it('creates a category with a normalised slug', async () => {
      const manager = await admin('content_manager');
      const created = await createCategory(manager.token, `Uji Coba ${Date.now()}`);

      expect(created.slug).toMatch(/^uji-coba-\d+$/);
    });

    it('refuses a duplicate slug', async () => {
      const manager = await admin('content_manager');
      const slug = `dupe-${Date.now()}`;
      await createCategory(manager.token, slug);

      await http
        .post('/v1/admin/categories')
        .set('authorization', `Bearer ${manager.token}`)
        .send({ slug, name: 'Kategori Kembar' })
        .expect(409);
    });

    it('offers no way to change a slug', async () => {
      // Slugs appear in URLs and in the feed's topic filter. Leaving the field
      // out of the request shape is stronger than validating it away.
      const manager = await admin('content_manager');
      const created = await createCategory(manager.token, `stabil-${Date.now()}`);

      await http
        .patch(`/v1/admin/categories/${created.id}`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ name: 'Nama Baru', slug: 'slug-baru' })
        .expect(200);

      const after = await prisma.postCategory.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.slug).toBe(created.slug);
      expect(after.name).toBe('Nama Baru');
    });

    it('archives instead of deleting, and old posts stay readable', async () => {
      // The acceptance criterion. Every post carries a category id; deleting
      // the row would orphan or cascade them away.
      const manager = await admin('content_manager');
      const author = await user();
      const created = await createCategory(manager.token, `arsip-${Date.now()}`);

      await clearCaches();
      const post = await http
        .post('/v1/posts')
        .set('authorization', `Bearer ${author.token}`)
        .send({
          body: CURHAT_BODY,
          categorySlug: created.slug,
          mood: 'capek',
          intent: 'cuma_didengar',
        })
        .expect(201);

      const postId = post.body.data.postId as string;

      await http
        .patch(`/v1/admin/categories/${created.id}/active`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ isActive: false })
        .expect(200);

      // The row is still there, and so is the post.
      expect(
        await prisma.postCategory.findUnique({ where: { id: created.id } }),
      ).not.toBeNull();

      await http
        .get(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      // But it is no longer offered as a choice.
      const active = await http
        .get('/v1/categories')
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(
        (active.body.data as Array<{ slug: string }>).map((category) => category.slug),
      ).not.toContain(created.slug);
    });

    it('invalidates the category cache on change', async () => {
      const manager = await admin('content_manager');
      const reader = await user();

      // Warm the cache.
      await http
        .get('/v1/categories')
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      const created = await createCategory(manager.token, `cache-${Date.now()}`);

      // A stale cache would not contain it (E05-T01 caches for 5 minutes).
      const after = await http
        .get('/v1/categories')
        .set('authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(
        (after.body.data as Array<{ slug: string }>).map((category) => category.slug),
      ).toContain(created.slug);
    });

    it('reorders in one transaction', async () => {
      const manager = await admin('content_manager');
      const first = await createCategory(manager.token, `urut-a-${Date.now()}`);
      const second = await createCategory(manager.token, `urut-b-${Date.now()}`);

      await http
        .post('/v1/admin/categories/reorder')
        .set('authorization', `Bearer ${manager.token}`)
        .send({
          order: [
            { id: first.id, displayOrder: 90 },
            { id: second.id, displayOrder: 91 },
          ],
        })
        .expect(201);

      const rows = await prisma.postCategory.findMany({
        where: { id: { in: [first.id, second.id] } },
        orderBy: { displayOrder: 'asc' },
      });

      expect(rows.map((row) => row.displayOrder)).toEqual([90, 91]);
    });

    it('refuses category management to a moderator', async () => {
      // A moderator moderates; the shelf is somebody else's job (E14-T02).
      const moderator = await admin('moderator');

      await http
        .get('/v1/admin/categories')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(403);
    });

    it('audits a change with a diff of only what changed', async () => {
      const manager = await admin('content_manager');
      const created = await createCategory(manager.token, `diff-${Date.now()}`);

      await http
        .patch(`/v1/admin/categories/${created.id}`)
        .set('authorization', `Bearer ${manager.token}`)
        .send({ name: 'Nama Yang Diubah' })
        .expect(200);

      const audited = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'admin.category.updated', targetId: created.id },
      });

      const diff = audited.diff as Record<string, { from: unknown; to: unknown }>;
      expect(diff['name']).toEqual({ from: 'Kategori Uji', to: 'Nama Yang Diubah' });
      // A full snapshot makes every diff look enormous and buries the one line
      // that matters.
      expect(Object.keys(diff)).toEqual(['name']);
    });
  });
});
