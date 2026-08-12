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

interface Admin {
  token: string;
  userId: string;
  secret: string;
}

describeDb('admin panel (E14-T01 to T04)', () => {
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

  /** An authenticated ordinary account. */
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

  /**
   * An admin with MFA enrolled and a verified session.
   *
   * Goes through the real endpoints rather than writing rows directly — the
   * handshake is what is under test, and a fixture that skips it would prove
   * only that the fixture works.
   */
  async function admin(role: AdminRole, options: { verify?: boolean } = {}): Promise<Admin> {
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

    if (options.verify !== false) {
      // The next step's code, because confirm just consumed this one. In the
      // real panel the admin types whatever their phone shows a moment later.
      await http
        .post('/v1/admin/auth/login')
        .set('authorization', `Bearer ${account.token}`)
        .send({ code: nextStepCode(secret) })
        .expect(201);
    }

    return { token: account.token, userId: account.userId, secret };
  }

  /**
   * The code for the step after the current one.
   *
   * Aligned to the step boundary rather than "now + 31s": an unaligned offset
   * can land two steps ahead, which falls outside the ±1 window the server
   * accepts and makes the test fail for a reason that has nothing to do with
   * what it is testing.
   */
  function nextStepCode(secret: string): string {
    const step = Math.floor(Date.now() / 1000 / 30);
    return generateTotp(secret, new Date((step + 1) * 30 * 1000));
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
  // E14-T01 — MFA is mandatory
  // -------------------------------------------------------------------------

  describe('MFA (E14-T01)', () => {
    it('gives an authenticated session no admin access without MFA', () => {
      // The acceptance criterion: login without MFA does not produce a usable
      // admin session.
      return admin('super_admin', { verify: false }).then(async (person) => {
        const response = await http
          .get('/v1/admin/me')
          .set('authorization', `Bearer ${person.token}`)
          .expect(403);

        expect(response.body.error.code).toBe('ADMIN_MFA_REQUIRED');
      });
    });

    it('grants access after the code is verified', async () => {
      const person = await admin('super_admin');

      const response = await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(response.body.data.role).toBe('super_admin');
      expect(response.body.data.permissions).toContain('ai_config.write');
    });

    it('refuses a wrong code', async () => {
      const person = await admin('moderator', { verify: false });

      const response = await http
        .post('/v1/admin/auth/login')
        .set('authorization', `Bearer ${person.token}`)
        .send({ code: '000000' })
        .expect(401);

      expect(response.body.error.code).toBe('ADMIN_MFA_INVALID');
    });

    it('refuses a code that was already used', async () => {
      // A TOTP code stays valid for its whole window, so a code captured by a
      // phishing page could otherwise be replayed within the minute.
      const person = await admin('moderator', { verify: false });
      const code = nextStepCode(person.secret);

      await http
        .post('/v1/admin/auth/login')
        .set('authorization', `Bearer ${person.token}`)
        .send({ code })
        .expect(201);

      const replay = await http
        .post('/v1/admin/auth/login')
        .set('authorization', `Bearer ${person.token}`)
        .send({ code })
        .expect(401);

      expect(replay.body.error.code).toBe('ADMIN_MFA_INVALID');
    });

    it('locks out after repeated failures', async () => {
      const person = await admin('moderator', { verify: false });

      let locked = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await http
          .post('/v1/admin/auth/login')
          .set('authorization', `Bearer ${person.token}`)
          .send({ code: '111111' });

        if (response.status === 429) {
          expect(response.body.error.code).toBe('ADMIN_MFA_LOCKED');
          locked = true;
          break;
        }
      }

      expect(locked).toBe(true);

      // And the lockout is not an oracle: a *correct* code is refused too.
      const afterLock = await http
        .post('/v1/admin/auth/login')
        .set('authorization', `Bearer ${person.token}`)
        .send({ code: nextStepCode(person.secret) });

      expect(afterLock.status).toBe(429);
    });

    it('refuses to re-enrol while MFA is already active', async () => {
      // Otherwise this is the single most useful endpoint for anyone holding a
      // stolen session.
      const person = await admin('super_admin');

      await http
        .post('/v1/admin/auth/mfa/enrol')
        .set('authorization', `Bearer ${person.token}`)
        .expect(409);
    });

    it('refuses enrolment for an account that is not an admin', async () => {
      const person = await user();

      await http
        .post('/v1/admin/auth/mfa/enrol')
        .set('authorization', `Bearer ${person.token}`)
        .expect(403);
    });

    it('never returns the secret again after enrolment', async () => {
      const person = await admin('super_admin');

      const me = await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(JSON.stringify(me.body)).not.toContain(person.secret);
    });

    it('stores the TOTP secret encrypted', async () => {
      const person = await admin('moderator');

      const row = await prisma.user.findUniqueOrThrow({
        where: { id: person.userId },
        select: { mfaSecretEncrypted: true, mfaEnabledAt: true },
      });

      expect(row.mfaSecretEncrypted).not.toContain(person.secret);
      expect(row.mfaEnabledAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // E14-T02 — RBAC over real HTTP
  // -------------------------------------------------------------------------

  describe('RBAC (E14-T02)', () => {
    it('hides the admin panel from an ordinary account entirely', async () => {
      const person = await user();

      // 404, not 403: whether an admin panel exists is not something an
      // ordinary token should be able to confirm.
      await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${person.token}`)
        .expect(404);
    });

    it('keeps AI config to Super Admin', async () => {
      const moderator = await admin('moderator');
      const superAdmin = await admin('super_admin');

      const forModerator = await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);
      expect(forModerator.body.data.permissions).not.toContain('ai_config.write');

      const forSuper = await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${superAdmin.token}`)
        .expect(200);
      expect(forSuper.body.data.permissions).toContain('ai_config.write');
    });

    it('refuses the audit log to a moderator', async () => {
      // Enforced at the API, not by hiding a menu item.
      const moderator = await admin('moderator');

      await http
        .get('/v1/admin/audit')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(403);
    });

    it('refuses private content to Customer Support', async () => {
      const support = await admin('customer_support');

      await http
        .get('/v1/admin/private-content/notice')
        .set('authorization', `Bearer ${support.token}`)
        .expect(403);
    });

    it('records a refused permission attempt', async () => {
      const moderator = await admin('moderator');

      await http
        .get('/v1/admin/audit')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(403);

      const denied = await prisma.auditLog.findFirst({
        where: { actorId: moderator.userId, action: 'admin.permission.denied' },
      });

      expect(denied).not.toBeNull();
      expect(denied?.targetId).toBe('audit.read');
    });

    it('stops working the moment the role is revoked', async () => {
      // Read from the database, not from the token — otherwise a revoked role
      // keeps working for the fifteen minutes the access token stays valid.
      const person = await admin('super_admin');

      await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      await prisma.user.update({ where: { id: person.userId }, data: { adminRole: null } });

      await http
        .get('/v1/admin/me')
        .set('authorization', `Bearer ${person.token}`)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  // E14-T03 — audit log
  // -------------------------------------------------------------------------

  describe('audit log (E14-T03)', () => {
    it('records the admin login', async () => {
      const person = await admin('super_admin');

      const entry = await prisma.auditLog.findFirst({
        where: { actorId: person.userId, action: 'admin.login' },
      });

      expect(entry).not.toBeNull();
      // The IP is hashed, never stored raw (PRD §25.2).
      expect(entry?.ipHash).not.toBeNull();
    });

    it('lists entries newest first with a cursor', async () => {
      const person = await admin('super_admin');

      const first = await http
        .get('/v1/admin/audit?limit=2')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(first.body.data.items.length).toBeGreaterThan(0);

      if (first.body.data.nextCursor) {
        const second = await http
          .get(`/v1/admin/audit?limit=2&cursor=${first.body.data.nextCursor as string}`)
          .set('authorization', `Bearer ${person.token}`)
          .expect(200);

        const firstIds = first.body.data.items.map((item: { id: string }) => item.id);
        const secondIds = second.body.data.items.map((item: { id: string }) => item.id);
        expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
      }
    });

    it('filters by action', async () => {
      const person = await admin('super_admin');

      const response = await http
        .get('/v1/admin/audit?action=admin.login')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      for (const item of response.body.data.items as Array<{ action: string }>) {
        expect(item.action).toContain('admin.login');
      }
    });

    it('exports CSV', async () => {
      const person = await admin('super_admin');

      const response = await http
        .get('/v1/admin/audit/export?action=admin.login')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      // Not wrapped in the {data, meta, error} envelope — a CSV whose first
      // line is JSON is not a CSV.
      expect(response.text.split('\n')[0]).toBe(
        'created_at,actor_id,actor_alias,action,target_type,target_id,case_id,diff',
      );
      expect(response.text).not.toContain('"meta"');
    });

    it('offers no way to change or remove an entry', async () => {
      const person = await admin('super_admin');

      for (const method of ['delete', 'put', 'patch'] as const) {
        const response = await http[method]('/v1/admin/audit').set(
          'authorization',
          `Bearer ${person.token}`,
        );

        // 404 because the route does not exist at all.
        expect(response.status, method).toBe(404);
      }
    });
  });

  // -------------------------------------------------------------------------
  // E14-T04 — private content needs an open case
  // -------------------------------------------------------------------------

  describe('private content (E14-T04)', () => {
    /** A room with one message, and optionally a case pointing at it. */
    async function roomWithMessage(): Promise<{ roomId: string; messageId: string }> {
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
        data: {
          roomId: room.id,
          senderId: requester.userId,
          body: 'Aku sebenarnya nggak tau harus cerita ke siapa lagi.',
        },
      });

      return { roomId: room.id, messageId: message.id };
    }

    it('shows the notice before any content is requested', async () => {
      const moderator = await admin('moderator');

      const response = await http
        .get('/v1/admin/private-content/notice')
        .set('authorization', `Bearer ${moderator.token}`)
        .expect(200);

      // PRD §25.6: the admin is told the access is recorded, and told before.
      expect(response.body.data.notice).toContain('dicatat permanen');
    });

    it('refuses access without a case and records the attempt', async () => {
      const moderator = await admin('moderator');
      const { roomId } = await roomWithMessage();

      const response = await http
        .post('/v1/admin/private-content/open')
        .set('authorization', `Bearer ${moderator.token}`)
        .send({
          caseId: '11111111-1111-4111-8111-111111111111',
          targetType: 'message',
          targetId: roomId,
        })
        .expect(403);

      expect(response.body.error.code).toBe('ADMIN_CASE_REQUIRED');

      const denied = await prisma.auditLog.findFirst({
        where: { actorId: moderator.userId, action: 'admin.private_content.denied' },
      });
      expect(denied).not.toBeNull();
    });

    it('opens the room when a matching case is open, and logs it', async () => {
      const moderator = await admin('moderator');
      const { roomId, messageId } = await roomWithMessage();

      const moderationCase = await prisma.moderationCase.create({
        data: {
          source: 'report',
          queue: 'high',
          targetType: 'message',
          targetId: messageId,
          slaDueAt: new Date(Date.now() + 3_600_000),
        },
      });

      const response = await http
        .post('/v1/admin/private-content/open')
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ caseId: moderationCase.id, targetType: 'message', targetId: roomId })
        .expect(201);

      expect(response.body.data.messages).toHaveLength(1);
      expect(response.body.data.notice).toContain('dicatat permanen');
      // Role, not identity.
      expect(response.body.data.messages[0].senderRole).toBe('requester');
      expect(JSON.stringify(response.body.data)).not.toContain('senderId');

      const opened = await prisma.auditLog.findFirst({
        where: {
          actorId: moderator.userId,
          action: 'admin.private_content.opened',
          caseId: moderationCase.id,
        },
      });
      expect(opened).not.toBeNull();
      expect(opened?.targetId).toBe(roomId);
    });

    it('refuses a case that points somewhere else', async () => {
      // Without this check, any open case anywhere is a skeleton key for every
      // private conversation on the platform.
      const moderator = await admin('moderator');
      const target = await roomWithMessage();
      const unrelated = await roomWithMessage();

      const moderationCase = await prisma.moderationCase.create({
        data: {
          source: 'report',
          queue: 'high',
          targetType: 'message',
          targetId: unrelated.messageId,
          slaDueAt: new Date(Date.now() + 3_600_000),
        },
      });

      const response = await http
        .post('/v1/admin/private-content/open')
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ caseId: moderationCase.id, targetType: 'message', targetId: target.roomId })
        .expect(403);

      expect(response.body.error.code).toBe('ADMIN_CASE_REQUIRED');
    });

    it('refuses a resolved case', async () => {
      const moderator = await admin('moderator');
      const { roomId, messageId } = await roomWithMessage();

      const moderationCase = await prisma.moderationCase.create({
        data: {
          source: 'report',
          queue: 'high',
          targetType: 'message',
          targetId: messageId,
          status: 'resolved',
          slaDueAt: new Date(Date.now() + 3_600_000),
        },
      });

      await http
        .post('/v1/admin/private-content/open')
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ caseId: moderationCase.id, targetType: 'message', targetId: roomId })
        .expect(403);
    });

    it('does not let a case about a person unlock their rooms', async () => {
      const moderator = await admin('moderator');
      const { roomId } = await roomWithMessage();
      const subject = await user();

      const moderationCase = await prisma.moderationCase.create({
        data: {
          source: 'report',
          queue: 'high',
          targetType: 'user',
          targetId: subject.userId,
          slaDueAt: new Date(Date.now() + 3_600_000),
        },
      });

      await http
        .post('/v1/admin/private-content/open')
        .set('authorization', `Bearer ${moderator.token}`)
        .send({ caseId: moderationCase.id, targetType: 'message', targetId: roomId })
        .expect(403);
    });
  });
});
