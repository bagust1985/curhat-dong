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

describeDb('admin moderation (E14-T05 to T07)', () => {
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

  /** A case on a real post, so actions have something to act on. */
  async function caseOnPost(
    queue: 'critical' | 'high' | 'medium' | 'low' = 'high',
    options: { slaDueAt?: Date } = {},
  ): Promise<{ caseId: string; postId: string; authorId: string }> {
    const author = await user();
    const postId = await postBy(author.token);

    const moderationCase = await prisma.moderationCase.create({
      data: {
        source: 'report',
        queue,
        targetType: 'post',
        targetId: postId,
        slaDueAt: options.slaDueAt ?? new Date(Date.now() + 3_600_000),
      },
    });

    return { caseId: moderationCase.id, postId, authorId: author.userId };
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

    // `moderation_cases.target_id` is not a foreign key — a case outlives the
    // user it pointed at, so the table accumulates rows from every previous
    // run. Queue ordering and pagination are only observable against a known
    // set, so the leftovers go first.
    await prisma.moderationAppeal.deleteMany({});
    await prisma.moderationCase.deleteMany({});
  }, 120_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      // `moderation_actions.moderator_id` has no cascade, on purpose: deleting
      // a moderator's account must not erase the record of the decisions they
      // made. So the actions this suite created go first.
      await prisma.moderationAppeal.deleteMany({
        where: { deciderId: { in: createdUserIds } },
      });
      await prisma.moderationAction.deleteMany({
        where: { moderatorId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await clearCaches();
    await app.close();
  });

  // -------------------------------------------------------------------------
  // E14-T05 — the queue
  // -------------------------------------------------------------------------

  describe('queue (E14-T05)', () => {
    it('puts Critical above everything regardless of age', async () => {
      const moderator = await admin('moderator');

      // The low-priority case is deliberately older and more overdue.
      await caseOnPost('low', { slaDueAt: new Date(Date.now() - 86_400_000) });
      const critical = await caseOnPost('critical');

      const response = await http
        .get('/v1/admin/moderation/queue?limit=50')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const items = response.body.data.items as Array<{ caseId: string; queue: string }>;
      const firstCritical = items.findIndex((item) => item.queue === 'critical');
      const firstLow = items.findIndex((item) => item.queue === 'low');

      expect(firstCritical).toBeGreaterThan(-1);
      expect(items.map((item) => item.caseId)).toContain(critical.caseId);
      if (firstLow > -1) expect(firstCritical).toBeLessThan(firstLow);
    });

    it('marks a case past its deadline as breached', async () => {
      const moderator = await admin('moderator');
      const overdue = await caseOnPost('high', { slaDueAt: new Date(Date.now() - 600_000) });

      const response = await http
        .get('/v1/admin/moderation/queue?breachedOnly=true&limit=50')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const found = (response.body.data.items as Array<{ caseId: string; slaState: string; minutesToSla: number }>).find(
        (item) => item.caseId === overdue.caseId,
      );

      expect(found?.slaState).toBe('breached');
      expect(found?.minutesToSla).toBeLessThan(0);
    });

    it('warns before the deadline, not only after', async () => {
      const moderator = await admin('moderator');
      const soon = await caseOnPost('high', { slaDueAt: new Date(Date.now() + 5 * 60_000) });

      const response = await http
        .get('/v1/admin/moderation/queue?limit=100')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const found = (response.body.data.items as Array<{ caseId: string; slaState: string }>).find(
        (item) => item.caseId === soon.caseId,
      );

      // A red badge on an already-breached case tells a moderator something
      // they can no longer act on.
      expect(found?.slaState).toBe('due_soon');
    });

    it('reports badge counts per queue', async () => {
      const moderator = await admin('moderator');
      await caseOnPost('critical');

      const response = await http
        .get('/v1/admin/moderation/counts')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      expect(response.body.data.critical).toBeGreaterThan(0);
      expect(response.body.data).toHaveProperty('breached');
    });

    it('shows an excerpt for a public post but never for a private message', async () => {
      const moderator = await admin('moderator');
      const publicCase = await caseOnPost('medium');

      // A case on a room message: no preview at all, and flagged as needing
      // the private-content flow (E14-T04).
      const requester = await user();
      const listener = await user();
      const room = await prisma.chatRoom.create({ data: { type: 'listener_session' } });
      await prisma.roomMember.createMany({
        data: [
          { roomId: room.id, userId: requester.userId, role: 'requester' },
          { roomId: room.id, userId: listener.userId, role: 'listener' },
        ],
      });
      const message = await prisma.message.create({
        data: { roomId: room.id, senderId: requester.userId, body: 'rahasia-zunpakwe' },
      });
      const privateCase = await prisma.moderationCase.create({
        data: {
          source: 'report',
          queue: 'medium',
          targetType: 'message',
          targetId: message.id,
          slaDueAt: new Date(Date.now() + 3_600_000),
        },
      });

      const response = await http
        .get('/v1/admin/moderation/queue?limit=100')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      const items = response.body.data.items as Array<{
        caseId: string;
        preview: string | null;
        requiresPrivateAccess: boolean;
      }>;

      const publicItem = items.find((item) => item.caseId === publicCase.caseId);
      expect(publicItem?.preview).toContain('capek');
      expect(publicItem?.requiresPrivateAccess).toBe(false);

      const privateItem = items.find((item) => item.caseId === privateCase.id);
      expect(privateItem?.preview).toBeNull();
      expect(privateItem?.requiresPrivateAccess).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('rahasia-zunpakwe');
    });

    it('paginates without repeating a case', async () => {
      const moderator = await admin('moderator');
      for (let i = 0; i < 4; i += 1) await caseOnPost('medium');

      const first = await http
        .get('/v1/admin/moderation/queue?queue=medium&limit=2')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      expect(first.body.data.items).toHaveLength(2);

      if (first.body.data.nextCursor) {
        const second = await http
          .get(
            `/v1/admin/moderation/queue?queue=medium&limit=2&cursor=${first.body.data.nextCursor as string}`,
          )
          .set('authorization', `Bearer ${moderator.token}`)
          .expect(200);

        const firstIds = first.body.data.items.map((item: { caseId: string }) => item.caseId);
        const secondIds = second.body.data.items.map((item: { caseId: string }) => item.caseId);
        expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // E14-T06 — case detail and the seven actions
  // -------------------------------------------------------------------------

  describe('case detail and actions (E14-T06)', () => {
    it('assembles what a moderator needs, and audits the look', async () => {
      const moderator = await admin('moderator');
      const { caseId, authorId } = await caseOnPost('high');

      const response = await http
        .get(`/v1/admin/moderation/cases/${caseId}`)
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      expect(response.body.data.content).toContain('capek');
      expect(response.body.data.targetUserId).toBe(authorId);
      expect(response.body.data).toHaveProperty('safetyHistory');
      expect(response.body.data).toHaveProperty('trustScore');

      const viewed = await prisma.auditLog.findFirst({
        where: { actorId: moderator.userId, action: 'admin.case.viewed', targetId: caseId },
      });
      expect(viewed).not.toBeNull();
    });

    it('never names who reported the content', async () => {
      const moderator = await admin('moderator');
      const { caseId, postId } = await caseOnPost('high');
      const reporter = await user();

      await prisma.report.create({
        data: {
          reporterId: reporter.userId,
          targetType: 'post',
          targetId: postId,
          category: 'spam',
          caseId,
        },
      });

      const response = await http
        .get(`/v1/admin/moderation/cases/${caseId}`)
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      expect(response.body.data.reports).toHaveLength(1);
      // Report is not a public act, and a named reporter is a name that can be
      // passed on.
      expect(JSON.stringify(response.body.data.reports)).not.toContain(reporter.userId);
    });

    it('refuses an action with no usable reason', async () => {
      const moderator = await admin('moderator');
      const { caseId } = await caseOnPost('high');

      for (const reason of ['', '   ', 'ok', 'spam']) {
        await http
          .post(`/v1/admin/moderation/cases/${caseId}/actions`)
          .set('authorization', `Bearer ${moderator.token}`)
          .send({ action: 'remove', reason })
          .expect(400);
      }
    });

    it('refuses a mute or suspend with no duration', async () => {
      const moderator = await admin('moderator');
      const { caseId } = await caseOnPost('high');

      await http
        .post(`/v1/admin/moderation/cases/${caseId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'mute', reason: 'Berulang kali mengirim spam ke banyak orang.' })
        .expect(400);
    });

    it('applies an action and tells the user where to appeal', async () => {
      const moderator = await admin('moderator');
      const { caseId, postId, authorId } = await caseOnPost('high');

      const response = await http
        .post(`/v1/admin/moderation/cases/${caseId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'remove', reason: 'Berisi informasi pribadi orang lain tanpa izin.' })
        .expect(201);

      expect(response.body.data.appealable).toBe(true);

      const post = await prisma.curhatPost.findUniqueOrThrow({ where: { id: postId } });
      expect(post.status).toBe('removed');

      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: authorId, type: 'account' },
      });

      const payload = notification.payload as { body: string; deepLink: string };
      // Generic copy (E12-T04): the reason is not on a lock screen.
      expect(payload.body).toBe('Ada pembaruan terkait akunmu.');
      expect(payload.body).not.toContain('informasi pribadi');
      // But the deep link goes where the reason and the appeal button live.
      expect(payload.deepLink).toContain('/moderation/appeal/');
      expect(payload.deepLink).toContain(response.body.data.actionId as string);
    });

    it('does not notify anyone when content is approved', async () => {
      // Telling somebody their curhat was reviewed and cleared invites worry
      // about a thing that is already over.
      const moderator = await admin('moderator');
      const { caseId, authorId } = await caseOnPost('high');

      await http
        .post(`/v1/admin/moderation/cases/${caseId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'approve', reason: 'Tidak melanggar apa pun setelah ditinjau.' })
        .expect(201);

      expect(
        await prisma.notification.count({ where: { userId: authorId, type: 'account' } }),
      ).toBe(0);
    });

    it('has no way to act on a safety level', async () => {
      // Non-negotiable #2: nobody may be punished for a Level 3 signal. The
      // request shape cannot carry a level at all.
      const moderator = await admin('moderator');
      const { caseId } = await caseOnPost('critical');

      await http
        .post(`/v1/admin/moderation/cases/${caseId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'suspend', safetyLevel: 'L3', reason: 'Terdeteksi L3 oleh sistem.' })
        // Rejected for the missing duration, and the extra field is ignored
        // rather than honoured.
        .expect(400);
    });

    it('restricts bulk actions to the Low queue', async () => {
      const moderator = await admin('moderator');
      const low = await caseOnPost('low');
      const critical = await caseOnPost('critical');

      const response = await http
        .post('/v1/admin/moderation/cases/bulk')
        .set('authorization', `Bearer ${moderator.token}`)
        .send({
          caseIds: [low.caseId, critical.caseId],
          action: 'approve',
          reason: 'Laporan spam massal, sudah ditinjau sekumpulan.',
        })
        .expect(201);

      expect(response.body.data.applied).toBe(1);
      expect(response.body.data.skipped).toEqual([
        { caseId: critical.caseId, reason: 'bulk_only_for_low_queue' },
      ]);

      // The critical case is untouched — still waiting for somebody to read it.
      const untouched = await prisma.moderationCase.findUniqueOrThrow({
        where: { id: critical.caseId },
      });
      expect(untouched.status).not.toBe('resolved');
    });

    it('needs a step-up for an action but not for reading', async () => {
      const moderator = await admin('moderator');
      const { caseId } = await caseOnPost('high');

      // Reading works on the session as it stands.
      await http
        .get(`/v1/admin/moderation/cases/${caseId}`)
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      // Now age the step-up past its window and try to act.
      await prisma.userSession.updateMany({
        where: { userId: moderator.userId },
        data: { mfaVerifiedAt: new Date(Date.now() - 60 * 60_000) },
      });

      const stale = await http
        .post(`/v1/admin/moderation/cases/${caseId}/actions`)
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ action: 'approve', reason: 'Sudah ditinjau dan tidak melanggar.' })
        .expect(403);

      expect(stale.body.error.code).toBe('ADMIN_REAUTH_REQUIRED');

      // Reading still works — step-up guards the dangerous half only.
      await http
        .get(`/v1/admin/moderation/cases/${caseId}`)
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);
    });
  });

  // -------------------------------------------------------------------------
  // E14-T07 — appeal review
  // -------------------------------------------------------------------------

  describe('appeal review (E14-T07)', () => {
    /** A decided action with an appeal filed against it. */
    async function appealOn(
      decider: { token: string; userId: string },
    ): Promise<{ appealId: string; actionId: string; authorId: string }> {
      const { caseId, authorId } = await caseOnPost('high');

      const applied = await http
        .post(`/v1/admin/moderation/cases/${caseId}/actions`)
        .set('authorization', `Bearer ${decider.token}`)
        .send({ action: 'remove', reason: 'Melanggar pedoman komunitas soal doxxing.' })
        .expect(201);

      const actionId = applied.body.data.actionId as string;

      const appeal = await prisma.moderationAppeal.create({
        data: {
          actionId,
          userId: authorId,
          reason: 'Aku nggak merasa membocorkan data siapa pun, itu cerita tentang diriku.',
          deciderId: decider.userId,
          expiresAt: new Date(Date.now() + 14 * 86_400_000),
        },
      });

      return { appealId: appeal.id, actionId, authorId };
    }

    it('hides an appeal from the moderator whose decision it contests', async () => {
      // The acceptance criterion. Hidden by the query, not left to honesty:
      // refusing at the end means the moderator already read it and formed a
      // view they now have to set aside.
      const deciderA = await admin('moderator');
      const reviewerB = await admin('moderator');

      const { appealId } = await appealOn(deciderA);

      const ownQueue = await http
        .get('/v1/admin/appeals')
        .set('authorization', `Bearer ${deciderA.token}`)
        .expect(200);

      expect(
        (ownQueue.body.data as Array<{ appealId: string }>).map((a) => a.appealId),
      ).not.toContain(appealId);

      const otherQueue = await http
        .get('/v1/admin/appeals')
        .set('authorization', `Bearer ${reviewerB.token}`)
        .expect(200);

      expect(
        (otherQueue.body.data as Array<{ appealId: string }>).map((a) => a.appealId),
      ).toContain(appealId);
    });

    it('refuses the decision even if the decider reaches the endpoint directly', async () => {
      // Hiding is layer three; the service refusal is layer two. A moderator
      // who guesses the id must still be stopped.
      const decider = await admin('moderator');
      const { appealId } = await appealOn(decider);

      const response = await http
        .post(`/v1/admin/appeals/${appealId}/decision`)
        .set('authorization', `Bearer ${decider.token}`)
        .send({ status: 'overturned', note: 'Setelah ditinjau ulang, keputusan ini keliru.' })
        .expect(403);

      expect(response.body.error.code).toBe('APPEAL_REVIEWER_CONFLICT');
    });

    it('overturns, restores the content and tells the user', async () => {
      const decider = await admin('moderator');
      const reviewer = await admin('moderator');
      const { appealId, actionId, authorId } = await appealOn(decider);

      await prisma.notification.deleteMany({ where: { userId: authorId } });

      await http
        .post(`/v1/admin/appeals/${appealId}/decision`)
        .set('authorization', `Bearer ${reviewer.token}`)
        .send({
          status: 'overturned',
          note: 'Ceritanya tentang dirinya sendiri, bukan data orang lain. Kami pulihkan.',
        })
        .expect(201);

      const decided = await prisma.moderationAppeal.findUniqueOrThrow({
        where: { id: appealId },
      });
      expect(decided.status).toBe('overturned');
      expect(decided.reviewerId).toBe(reviewer.userId);

      const notification = await prisma.notification.findFirstOrThrow({
        where: { userId: authorId, type: 'account' },
      });
      const payload = notification.payload as { body: string; deepLink: string };
      expect(payload.body).toBe('Ada kabar tentang bandingmu.');
      expect(payload.deepLink).toContain(actionId);
    });

    it('requires a note a user could actually read', async () => {
      const decider = await admin('moderator');
      const reviewer = await admin('moderator');
      const { appealId } = await appealOn(decider);

      for (const note of ['', 'no', 'ditolak']) {
        await http
          .post(`/v1/admin/appeals/${appealId}/decision`)
          .set('authorization', `Bearer ${reviewer.token}`)
          .send({ status: 'upheld', note })
          .expect(400);
      }
    });

    it('requires a new duration when reducing a penalty', async () => {
      const decider = await admin('moderator');
      const reviewer = await admin('moderator');
      const { appealId } = await appealOn(decider);

      await http
        .post(`/v1/admin/appeals/${appealId}/decision`)
        .set('authorization', `Bearer ${reviewer.token}`)
        .send({ status: 'reduced', note: 'Pelanggarannya ada, tapi hukumannya terlalu berat.' })
        .expect(400);
    });

    it('shows the original reason so the reviewer can check the call', async () => {
      const decider = await admin('moderator');
      const reviewer = await admin('moderator');
      const { appealId } = await appealOn(decider);

      const response = await http
        .get(`/v1/admin/appeals/${appealId}`)
        .set('authorization', `Bearer ${reviewer.token}`)
        .expect(200);

      expect(response.body.data.originalAction.reason).toContain('doxxing');
      expect(response.body.data.reason).toContain('nggak merasa membocorkan');
      expect(response.body.data.isOwnDecision).toBe(false);
    });

    it('links each overturn rate to the threshold behind it', async () => {
      const reviewer = await admin('moderator');

      const response = await http
        .get('/v1/admin/appeals/overturn-rates')
        .set('authorization', `Bearer ${reviewer.token}`)
        .expect(200);

      for (const row of response.body.data as OverturnRow[]) {
        // A number saying "we are wrong 40% of the time about scam" is only
        // useful if the next click is the place to fix it (PRD §15.4).
        expect(row.calibrationLink).toContain('/ai-config?calibrate=');
      }
    });

    it('refuses appeal review to a role without the permission', async () => {
      const support = await admin('customer_support');

      await http
        .get('/v1/admin/appeals')
        .set('authorization', `Bearer ${support.token}`)
        .expect(403);
    });
  });
});

interface OverturnRow {
  action: string;
  rate: number;
  calibrationLink: string;
}
