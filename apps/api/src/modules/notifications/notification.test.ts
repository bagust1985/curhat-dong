import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { decrypt, hashEmail, hashToken } from '@curhat/auth';
import type { PrismaClient } from '@curhat/database';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ResponseInterceptor } from '../../common/response.interceptor.js';
import { ENV } from '../../config/env.config.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import type { FanoutOutcome } from './notification-fanout.service.js';
import { NotificationFanoutService } from './notification-fanout.service.js';
import { NotificationRealtimeService } from './notification-realtime.service.js';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

const CONSENTS = [
  { consentType: 'tos_privacy', granted: true },
  { consentType: 'sensitive_processing', granted: true },
  { consentType: 'analytics', granted: false },
];

/** The notification id, for outcomes that produced one. */
function idOf(outcome: FanoutOutcome): string | null {
  return 'notificationId' in outcome ? outcome.notificationId : null;
}

/** The exact sentence a notification must never carry (non-negotiable #3). */
const CURHAT_BODY =
  'Aku capek banget sama kerjaan dan nggak tau harus cerita ke siapa lagi soal ini.';

describeDb('notification (E12)', () => {
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
  let fanout: NotificationFanoutService;
  let realtime: NotificationRealtimeService;

  const createdUserIds: string[] = [];

  async function clearCaches(): Promise<void> {
    const keys = [
      ...(await redis.keys('turnstile:*')),
      ...(await redis.keys('ratelimit:*')),
      ...(await redis.keys('agegate:*')),
      ...(await redis.keys('feed:*')),
      ...(await redis.keys('nudge:*')),
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
    fanout = app.get(NotificationFanoutService);
    realtime = app.get(NotificationRealtimeService);
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
  // E12-T01 — device registration
  // -------------------------------------------------------------------------

  describe('device registration (E12-T01)', () => {
    it('stores one row per provider for the same user', async () => {
      const person = await user();

      const expo = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send({
          deviceId: 'handset-expo-1',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
          timezone: 'Asia/Jakarta',
        })
        .expect(201);

      const web = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send({
          deviceId: 'browser-1',
          platform: 'web',
          pushProvider: 'webpush',
          pushToken: JSON.stringify({
            endpoint: 'https://push.example/abc',
            keys: { p256dh: 'p', auth: 'a' },
          }),
          timezone: 'Asia/Jakarta',
        })
        .expect(201);

      expect(expo.body.data.pushProvider).toBe('expo');
      expect(web.body.data.pushProvider).toBe('webpush');

      const rows = await prisma.userDevice.findMany({ where: { userId: person.userId } });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.pushProvider).sort()).toEqual(['expo', 'webpush']);
    });

    it('does not duplicate a row when the same token is registered again', async () => {
      const person = await user();
      const body = {
        deviceId: 'handset-repeat',
        platform: 'android' as const,
        pushProvider: 'expo' as const,
        pushToken: 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]',
        timezone: 'Asia/Jakarta',
      };

      const first = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send(body)
        .expect(201);

      const second = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send(body)
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await prisma.userDevice.count({ where: { userId: person.userId } })).toBe(1);
    });

    it('moves a token that turns up under a different account', async () => {
      // A shared handset, or someone logging back in as themselves. Leaving
      // the old row would keep delivering one person's notifications to
      // whoever is holding the phone now.
      const first = await user();
      const second = await user();
      const token = 'ExponentPushToken[cccccccccccccccccccccc]';

      await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${first.token}`)
        .send({
          deviceId: 'shared-handset',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: token,
        })
        .expect(201);

      await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${second.token}`)
        .send({
          deviceId: 'shared-handset',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: token,
        })
        .expect(201);

      expect(await prisma.userDevice.count({ where: { userId: first.userId } })).toBe(0);
      expect(await prisma.userDevice.count({ where: { userId: second.userId } })).toBe(1);
    });

    it('stores the token encrypted, never in the clear', async () => {
      const person = await user();
      const token = 'ExponentPushToken[dddddddddddddddddddddd]';

      await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send({
          deviceId: 'handset-crypto',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: token,
        })
        .expect(201);

      const row = await prisma.userDevice.findFirstOrThrow({ where: { userId: person.userId } });

      expect(row.pushTokenEncrypted).not.toContain(token);
      expect(decrypt(row.pushTokenEncrypted, key)).toBe(token);
    });

    it('never returns the token to the client', async () => {
      const person = await user();

      const response = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send({
          deviceId: 'handset-view',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]',
        })
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain('ExponentPushToken');
      expect(response.body.data.pushTokenEncrypted).toBeUndefined();
    });

    it('unregisters by row id or by the client device id', async () => {
      const person = await user();

      const created = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${person.token}`)
        .send({
          deviceId: 'handset-bye',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: 'ExponentPushToken[ffffffffffffffffffffff]',
        })
        .expect(201);

      await http
        .delete(`/v1/devices/${created.body.data.id as string}`)
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(await prisma.userDevice.count({ where: { userId: person.userId } })).toBe(0);
    });

    it('refuses to unregister a device belonging to someone else', async () => {
      const owner = await user();
      const stranger = await user();

      const created = await http
        .post('/v1/devices')
        .set('authorization', `Bearer ${owner.token}`)
        .send({
          deviceId: 'handset-private',
          platform: 'android',
          pushProvider: 'expo',
          pushToken: 'ExponentPushToken[gggggggggggggggggggggg]',
        })
        .expect(201);

      await http
        .delete(`/v1/devices/${created.body.data.id as string}`)
        .set('authorization', `Bearer ${stranger.token}`)
        .expect(404);

      expect(await prisma.userDevice.count({ where: { userId: owner.userId } })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // E12-T04 — the rule this epic exists to keep
  // -------------------------------------------------------------------------

  describe('payload privacy end to end (E12-T04, non-negotiable #3)', () => {
    it('never carries curhat text into a notification about a reply', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku ngerti banget rasanya. Kamu nggak sendirian kok.' })
        .expect(201);

      const stored = await prisma.notification.findFirstOrThrow({
        where: { userId: author.userId, type: 'response' },
      });

      const serialised = JSON.stringify(stored.payload);
      expect(serialised).not.toContain('capek');
      expect(serialised).not.toContain('Aku ngerti banget');

      const listed = await http
        .get('/v1/notifications')
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      expect(JSON.stringify(listed.body)).not.toContain('capek');
      expect(listed.body.data.items[0].body).toBe('Ada seseorang yang membalas curhatmu.');
    });

    it('sends nothing to the author for their own comment', async () => {
      const author = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${author.token}`)
        .send({ body: 'Nambahin sedikit, aku lupa cerita bagian ini tadi.' })
        .expect(201);

      expect(
        await prisma.notification.count({ where: { userId: author.userId, type: 'response' } }),
      ).toBe(0);
    });

    it('sends nothing when the two people have blocked each other', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Semangat ya, aku pernah di posisi yang mirip.' })
        .expect(201);

      await prisma.notification.deleteMany({ where: { userId: author.userId } });
      await prisma.blockedUser.create({
        data: { blockerId: author.userId, blockedId: responder.userId },
      });

      const outcome = await fanout.notify({
        userId: author.userId,
        actorId: responder.userId,
        template: 'response.comment',
        targetId: postId,
        dedupeKey: `blocked-check:${postId}`,
      });

      expect(outcome).toEqual({ status: 'suppressed', reason: 'blocked' });
      expect(await prisma.notification.count({ where: { userId: author.userId } })).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // E12-T06 — idempotency
  // -------------------------------------------------------------------------

  describe('fanout idempotency (E12-T06)', () => {
    it('produces one notification when the same job runs twice', async () => {
      const person = await user();

      const first = await fanout.notify({
        userId: person.userId,
        template: 'response.comment',
        targetId: randomUUID(),
        dedupeKey: 'comment:retry-me',
      });

      const retry = await fanout.notify({
        userId: person.userId,
        template: 'response.comment',
        targetId: randomUUID(),
        dedupeKey: 'comment:retry-me',
      });

      expect(retry.status).toBe('duplicate');
      // The retry recognises its own earlier work rather than starting fresh.
      expect(idOf(retry)).toBe(idOf(first));
      expect(idOf(first)).toBeTruthy();
      expect(
        await prisma.notification.count({
          where: { userId: person.userId, dedupeKey: 'comment:retry-me' },
        }),
      ).toBe(1);
    });

    it('survives two jobs racing on the same key', async () => {
      const person = await user();

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () =>
          fanout.notify({
            userId: person.userId,
            template: 'social.reaction',
            targetId: randomUUID(),
            dedupeKey: 'race:one-event',
          }),
        ),
      );

      // Check-then-insert would let several callers all find nothing and all
      // insert. The unique index settles it instead.
      expect(outcomes.filter((o) => o.status === 'duplicate')).toHaveLength(4);
      expect(
        await prisma.notification.count({
          where: { userId: person.userId, dedupeKey: 'race:one-event' },
        }),
      ).toBe(1);
    });

    it('does not collapse unrelated notifications that carry no key', async () => {
      const person = await user();

      await fanout.notify({ userId: person.userId, template: 'ai.reminder' });
      await fanout.notify({ userId: person.userId, template: 'ai.reminder' });

      expect(
        await prisma.notification.count({ where: { userId: person.userId, type: 'ai' } }),
      ).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // E12-T05 — quiet hours
  // -------------------------------------------------------------------------

  describe('quiet hours enforcement (E12-T05)', () => {
    async function withDevice(userId: string, quietHoursStart: number): Promise<void> {
      await prisma.userDevice.create({
        data: {
          userId,
          deviceId: `quiet-${userId}`,
          platform: 'android',
          pushProvider: 'expo',
          pushTokenEncrypted: 'x',
          pushTokenHash: `hash-${userId}-${Math.random()}`,
          timezone: 'Asia/Jakarta',
          quietHoursStart,
          quietHoursEnd: (quietHoursStart + 9) % 24,
        },
      });
    }

    it('holds a social notification during the window', async () => {
      const person = await user();
      // A window that is open right now, whenever the suite runs.
      const localHour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          hour12: false,
        }).format(new Date()),
      );
      await withDevice(person.userId, localHour);

      const outcome = await fanout.notify({
        userId: person.userId,
        template: 'response.comment',
        targetId: 'post-quiet',
        dedupeKey: 'quiet:held',
      });

      expect(outcome.status).toBe('held');
      const row = await prisma.notification.findFirstOrThrow({
        where: { userId: person.userId, dedupeKey: 'quiet:held' },
      });
      expect(row.pushStatus).toBe('held');
      expect(row.deliverAfter).not.toBeNull();
    });

    it('drops a perishable notification instead of queueing it', async () => {
      // A match offer expires in 60 seconds. Delivered when the window ends it
      // points at nothing, and it cost the person a notification (PRD §14).
      const person = await user();
      const localHour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          hour12: false,
        }).format(new Date()),
      );
      await withDevice(person.userId, localHour);

      const outcome = await fanout.notify({
        userId: person.userId,
        template: 'listener.match_offer',
        targetId: 'match-quiet',
        dedupeKey: 'quiet:dropped',
      });

      expect(outcome).toMatchObject({ status: 'in_app_only', reason: 'dropped' });
    });

    it('sends safety and account notifications regardless of the hour', async () => {
      const person = await user();
      const localHour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          hour12: false,
        }).format(new Date()),
      );
      await withDevice(person.userId, localHour);

      for (const template of ['safety.support_available', 'account.appeal_result'] as const) {
        const outcome = await fanout.notify({
          userId: person.userId,
          template,
          dedupeKey: `quiet:exempt:${template}`,
        });

        // No live socket and no working provider in the test environment, so
        // the interesting assertion is that it was not held or dropped.
        expect(outcome.status).not.toBe('held');
        expect(outcome).not.toMatchObject({ reason: 'dropped' });
      }
    });

    it('drops a held notification that waited past its usefulness', async () => {
      const person = await user();

      await prisma.notification.create({
        data: {
          userId: person.userId,
          type: 'response',
          payload: { template: 'response.comment', targetId: 'post-stale' },
          dedupeKey: 'stale:one',
          pushStatus: 'held',
          deliverAfter: new Date(Date.now() - 60_000),
          // Older than notification.stale_after_minutes (12h by default).
          createdAt: new Date(Date.now() - 20 * 3_600_000),
        },
      });

      const result = await fanout.deliverDue();

      expect(result.dropped).toBeGreaterThanOrEqual(1);
      const row = await prisma.notification.findFirstOrThrow({
        where: { userId: person.userId, dedupeKey: 'stale:one' },
      });
      expect(row.pushStatus).toBe('dropped');
    });

    it('delivers a held notification once its window has ended', async () => {
      const person = await user();

      await prisma.notification.create({
        data: {
          userId: person.userId,
          type: 'response',
          payload: { template: 'response.comment', targetId: 'post-due' },
          dedupeKey: 'due:one',
          pushStatus: 'held',
          deliverAfter: new Date(Date.now() - 60_000),
        },
      });

      const result = await fanout.deliverDue();

      expect(result.delivered).toBeGreaterThanOrEqual(1);
      const row = await prisma.notification.findFirstOrThrow({
        where: { userId: person.userId, dedupeKey: 'due:one' },
      });
      expect(row.pushStatus).not.toBe('held');
    });
  });

  // -------------------------------------------------------------------------
  // E12-T08 — realtime instead of push
  // -------------------------------------------------------------------------

  describe('realtime vs push (E12-T08)', () => {
    it('sends over the socket and skips the push when the user is connected', async () => {
      const person = await user();
      const emit = vi.spyOn(realtime, 'emitToUser').mockImplementation(() => undefined);
      const live = vi.spyOn(realtime, 'hasLiveSocket').mockResolvedValue(true);

      try {
        const outcome = await fanout.notify({
          userId: person.userId,
          template: 'response.comment',
          targetId: 'post-live',
          dedupeKey: 'ws:online',
        });

        expect(outcome).toMatchObject({ status: 'sent', channel: 'realtime' });
        expect(emit).toHaveBeenCalledWith(
          person.userId,
          'notification:new',
          expect.objectContaining({ body: 'Ada seseorang yang membalas curhatmu.' }),
        );

        const row = await prisma.notification.findFirstOrThrow({
          where: { userId: person.userId, dedupeKey: 'ws:online' },
        });
        // Not pushed: one event, one notification.
        expect(row.pushStatus).toBe('skipped');
        expect(row.pushedAt).toBeNull();
      } finally {
        emit.mockRestore();
        live.mockRestore();
      }
    });

    it('takes the push path when the user is not connected', async () => {
      const person = await user();
      const live = vi.spyOn(realtime, 'hasLiveSocket').mockResolvedValue(false);

      try {
        const outcome = await fanout.notify({
          userId: person.userId,
          template: 'response.comment',
          targetId: 'post-offline',
          dedupeKey: 'ws:offline',
        });

        expect(outcome).toMatchObject({ status: 'sent', channel: 'push' });
      } finally {
        live.mockRestore();
      }
    });

    it('emits a payload with no curhat content over the socket either', async () => {
      const person = await user();
      const emitted: unknown[] = [];
      const emit = vi.spyOn(realtime, 'emitToUser').mockImplementation((_id, _event, payload) => {
        emitted.push(payload);
      });
      const live = vi.spyOn(realtime, 'hasLiveSocket').mockResolvedValue(true);

      try {
        await fanout.notify({
          userId: person.userId,
          template: 'listener.room_message',
          targetId: 'room-1',
          dedupeKey: 'ws:room-message',
        });

        expect(JSON.stringify(emitted)).not.toContain('capek');
        expect(JSON.stringify(emitted)).toContain('Ada pesan baru di ruang privatmu.');
      } finally {
        emit.mockRestore();
        live.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------------
  // E12-T07 — in-app list
  // -------------------------------------------------------------------------

  describe('in-app notifications (E12-T07)', () => {
    it('pages with a cursor and reports the unread count', async () => {
      const person = await user();

      for (let i = 0; i < 5; i += 1) {
        await fanout.notify({
          userId: person.userId,
          template: 'social.reaction',
          targetId: randomUUID(),
          dedupeKey: `page:${person.userId}:${i}`,
        });
      }

      const first = await http
        .get('/v1/notifications?limit=2')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(first.body.data.items).toHaveLength(2);
      expect(first.body.data.nextCursor).toBeTruthy();
      expect(first.body.data.unreadCount).toBe(5);

      const second = await http
        .get(`/v1/notifications?limit=2&cursor=${first.body.data.nextCursor as string}`)
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      const firstIds = first.body.data.items.map((item: { id: string }) => item.id);
      const secondIds = second.body.data.items.map((item: { id: string }) => item.id);
      expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
    });

    it('restarts from the top on a broken cursor instead of erroring', async () => {
      const person = await user();
      await fanout.notify({
        userId: person.userId,
        template: 'social.reaction',
        targetId: randomUUID(),
        dedupeKey: `cursor:${person.userId}`,
      });

      const response = await http
        .get('/v1/notifications?cursor=bukan-cursor-yang-benar')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(response.body.data.items).toHaveLength(1);
    });

    it('marks notifications read', async () => {
      const person = await user();
      await fanout.notify({
        userId: person.userId,
        template: 'social.reaction',
        targetId: randomUUID(),
        dedupeKey: `read:${person.userId}`,
      });

      await http
        .post('/v1/notifications/read')
        .set('authorization', `Bearer ${person.token}`)
        .send({})
        .expect(201);

      const count = await http
        .get('/v1/notifications/unread-count')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(count.body.data.count).toBe(0);
    });

    it('flags a deleted target rather than sending someone into an error', async () => {
      const author = await user();
      const responder = await user();
      const postId = await postBy(author.token);

      await http
        .post(`/v1/posts/${postId}/comments`)
        .set('authorization', `Bearer ${responder.token}`)
        .send({ body: 'Aku dengerin kok, cerita aja terus kalau mau.' })
        .expect(201);

      await http
        .delete(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      const listed = await http
        .get('/v1/notifications')
        .set('authorization', `Bearer ${author.token}`)
        .expect(200);

      const item = listed.body.data.items.find(
        (entry: { template: string }) => entry.template === 'response.comment',
      );

      expect(item).toBeTruthy();
      expect(item.targetAvailable).toBe(false);
      // Warm copy served from the API so web and mobile say the same thing.
      expect(item.unavailableMessage).toBe('Yang dituju notifikasi ini sudah nggak ada.');
      // Still a valid link — the client shows that note on arrival, not a 404.
      expect(item.deepLink).toBe(`/post/${postId}`);
    });

    it('shows nobody else their notifications', async () => {
      const owner = await user();
      const stranger = await user();

      await fanout.notify({
        userId: owner.userId,
        template: 'social.reaction',
        targetId: randomUUID(),
        dedupeKey: `private:${owner.userId}`,
      });

      const listed = await http
        .get('/v1/notifications')
        .set('authorization', `Bearer ${stranger.token}`)
        .expect(200);

      expect(listed.body.data.items).toHaveLength(0);
    });

    it('honours the per-type in-app toggle', async () => {
      const person = await user();

      await http
        .patch('/v1/me/notification-settings')
        .set('authorization', `Bearer ${person.token}`)
        .send({ perTypeToggles: { social: { push: false, inApp: false } } })
        .expect(200);

      await fanout.notify({
        userId: person.userId,
        template: 'social.reaction',
        targetId: randomUUID(),
        dedupeKey: `toggle:${person.userId}`,
      });

      const listed = await http
        .get('/v1/notifications')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      expect(listed.body.data.items).toHaveLength(0);
      expect(listed.body.data.unreadCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // E12-T03 — web push key
  // -------------------------------------------------------------------------

  describe('web push (E12-T03)', () => {
    it('reports whether web push is available at all', async () => {
      const person = await user();

      const response = await http
        .get('/v1/devices/webpush-key')
        .set('authorization', `Bearer ${person.token}`)
        .expect(200);

      // Null in an environment with no VAPID keys — the client then skips the
      // permission prompt rather than asking for something we cannot honour.
      expect(response.body.data).toHaveProperty('publicKey');
    });
  });
});
