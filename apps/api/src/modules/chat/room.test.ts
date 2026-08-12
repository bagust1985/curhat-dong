import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProviderResolver } from '@curhat/ai';
import type { ServerEnv } from '@curhat/config/env/server';
import { createPrismaClient, type PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { SafetyThresholdsService } from '../safety/safety-thresholds.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';
import { AiBudgetService } from '../ai/ai-budget.service.js';
import { AI_PROVIDER_RESOLVER, AiGatewayService } from '../ai/ai-gateway.service.js';
import { AiQuotaService } from '../ai/ai-quota.service.js';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { PromptRegistryService } from '../ai/prompt-registry.service.js';
import { SessionService } from '../auth/session.service.js';
import { FeltHeardService } from '../felt-heard/felt-heard.service.js';
import { AvailabilityService } from '../listener/availability.service.js';
import { BurnoutService } from '../listener/burnout.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { LocalRulesService } from '../safety/local-rules.service.js';
import { SupportResourcesService } from '../safety/support-resources.service.js';
import { wibDayKey } from '../ai/wib-day.js';
import { MessageSafetyService } from './message-safety.service.js';
import { PresenceService } from './presence.service.js';
import { RoomAccessService } from './room-access.service.js';
import { RoomEventsService } from './room-events.service.js';
import { RoomMessagesService } from './room-messages.service.js';
import { RoomsService } from './rooms.service.js';
import { ScriptedAiProvider } from './scripted-provider.js';

config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'];
const describeIntegration = databaseUrl && redisUrl ? describe : describe.skip;

describeIntegration('private room (E11)', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let rooms: RoomsService;
  let messages: RoomMessagesService;
  let access: RoomAccessService;
  let safety: MessageSafetyService;
  let presence: PresenceService;
  let burnout: BurnoutService;
  let provider: ScriptedAiProvider;

  const createdUserIds: string[] = [];

  async function makeUser(): Promise<string> {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);
    return user.id;
  }

  /** A room with a live session, exactly as E10's accept leaves it. */
  async function makeRoom(): Promise<{
    roomId: string;
    sessionId: string;
    requesterId: string;
    listenerId: string;
  }> {
    const requesterId = await makeUser();
    const listenerId = await makeUser();

    await prisma.listenerProfile.create({
      data: {
        userId: listenerId,
        guidelinesVersionAccepted: 'test',
        guidelinesAcceptedAt: new Date(),
      },
    });

    const request = await prisma.listenerRequest.create({
      data: { requesterId, topic: 'work', emotion: 'lelah', status: 'matched' },
    });
    const match = await prisma.listenerMatch.create({
      data: {
        requestId: request.id,
        requesterId,
        listenerId,
        status: 'accepted',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const room = await prisma.chatRoom.create({ data: { type: 'listener_session' } });
    await prisma.roomMember.createMany({
      data: [
        { roomId: room.id, userId: requesterId, role: 'requester' },
        { roomId: room.id, userId: listenerId, role: 'listener' },
      ],
    });
    const session = await prisma.listenerSession.create({
      data: { matchId: match.id, roomId: room.id, requesterId, listenerId },
    });

    return { roomId: room.id, sessionId: session.id, requesterId, listenerId };
  }

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    redis = new Redis(redisUrl as string, { maxRetriesPerRequest: 2 });
    provider = new ScriptedAiProvider();

    const resolver: ProviderResolver = { get: () => provider, order: () => ['local'] };
    const env = { AI_DAILY_BUDGET: 1_000, AI_DEFAULT_PROVIDER: 'local' } as ServerEnv;

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PRISMA, useValue: prisma },
        { provide: REDIS, useValue: redis },
        { provide: ENV, useValue: env },
        { provide: AI_PROVIDER_RESOLVER, useValue: resolver },
        AppConfigService,
        RateLimitService,
        SessionService,
        LocalRulesService,
        SupportResourcesService,
        ModerationService,
        FeltHeardService,
        PromptRegistryService,
        AiUsageService,
        AiBudgetService,
        AiQuotaService,
        AiGatewayService,
        AvailabilityService,
        BurnoutService,
        RoomAccessService,
        RoomEventsService,
        RoomMessagesService,
        // E14-T12: the safety engine reads its thresholds from config now.
        SafetyThresholdsService,
        MessageSafetyService,
        PresenceService,
        RoomsService,
      ],
    }).compile();

    rooms = moduleRef.get(RoomsService);
    messages = moduleRef.get(RoomMessagesService);
    access = moduleRef.get(RoomAccessService);
    safety = moduleRef.get(MessageSafetyService);
    presence = moduleRef.get(PresenceService);
    burnout = moduleRef.get(BurnoutService);
  });

  afterAll(async () => {
    await prisma.aiUsageEvent.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(() => {
    provider.risk = { riskScores: { toxicity: 0.01 }, ambiguous: false };
  });

  // -------------------------------------------------------------------------
  // E11-T02 — membership. This is the security test the task calls mandatory.
  // -------------------------------------------------------------------------

  describe('membership', () => {
    it('refuses everything to somebody who is not in the room', async () => {
      const { roomId } = await makeRoom();
      const stranger = await makeUser();

      await expect(access.require(stranger, roomId)).rejects.toMatchObject({
        code: 'ROOM_NOT_MEMBER',
      });
      await expect(
        messages.create({ userId: stranger, roomId, body: 'halo' }),
      ).rejects.toBeInstanceOf(ApiException);
      await expect(messages.history(stranger, roomId)).rejects.toBeInstanceOf(ApiException);
      await expect(rooms.close(stranger, roomId)).rejects.toBeInstanceOf(ApiException);
    });

    it('is checked again on every event, not once at join', async () => {
      const { roomId, requesterId } = await makeRoom();

      // Allowed now.
      await messages.create({ userId: requesterId, roomId, body: 'halo' });

      // The membership that justified it ends underneath the connection.
      await prisma.roomMember.update({
        where: { roomId_userId: { roomId, userId: requesterId } },
        data: { leftAt: new Date() },
      });

      await expect(
        messages.create({ userId: requesterId, roomId, body: 'masih di sini?' }),
      ).rejects.toMatchObject({ code: 'ROOM_NOT_MEMBER' });
    });

    it('cuts access the moment either side blocks', async () => {
      const { roomId, requesterId, listenerId } = await makeRoom();

      await prisma.blockedUser.create({
        data: { blockerId: listenerId, blockedId: requesterId },
      });

      // Both directions: the person who blocked loses the room too.
      await expect(access.require(requesterId, roomId)).rejects.toMatchObject({
        code: 'USER_BLOCKED',
      });
      await expect(access.require(listenerId, roomId)).rejects.toMatchObject({
        code: 'USER_BLOCKED',
      });
    });

    it('keeps history readable after the session ends but stops new messages', async () => {
      const { roomId, requesterId } = await makeRoom();
      await messages.create({ userId: requesterId, roomId, body: 'halo' });

      await rooms.close(requesterId, roomId);

      expect((await messages.history(requesterId, roomId)).items).toHaveLength(1);
      await expect(
        messages.create({ userId: requesterId, roomId, body: 'lagi' }),
      ).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    });
  });

  // -------------------------------------------------------------------------
  // E11-T03 — messaging
  // -------------------------------------------------------------------------

  describe('messaging', () => {
    it('persists before anything else can see it', async () => {
      const { roomId, requesterId } = await makeRoom();

      const { message } = await messages.create({
        userId: requesterId,
        roomId,
        body: 'halo, makasih udah mau dengerin',
      });

      const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(stored.body).toBe('halo, makasih udah mau dengerin');
      expect(stored.safetyLevel).toBe('pending');
    });

    it('treats a retry with the same client id as the same message', async () => {
      const { roomId, requesterId } = await makeRoom();
      const clientMessageId = randomUUID();

      const first = await messages.create({
        userId: requesterId,
        roomId,
        body: 'halo',
        clientMessageId,
      });
      const retry = await messages.create({
        userId: requesterId,
        roomId,
        body: 'halo',
        clientMessageId,
      });

      expect(retry.duplicate).toBe(true);
      expect(retry.message.id).toBe(first.message.id);
      expect(await prisma.message.count({ where: { roomId } })).toBe(1);
    });

    it('survives two simultaneous retries of the same message', async () => {
      const { roomId, requesterId } = await makeRoom();
      const clientMessageId = randomUUID();

      const results = await Promise.all([
        messages.create({ userId: requesterId, roomId, body: 'halo', clientMessageId }),
        messages.create({ userId: requesterId, roomId, body: 'halo', clientMessageId }),
      ]);

      expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
      expect(await prisma.message.count({ where: { roomId } })).toBe(1);
    });

    it('pages history newest-first', async () => {
      const { roomId, requesterId } = await makeRoom();
      for (const body of ['satu', 'dua', 'tiga']) {
        await messages.create({ userId: requesterId, roomId, body });
      }

      const page = await messages.history(requesterId, roomId, undefined, 2);
      expect(page.items.map((item) => item.body)).toEqual(['tiga', 'dua']);
      expect(page.nextCursor).not.toBeNull();

      const next = await messages.history(requesterId, roomId, page.nextCursor ?? undefined, 2);
      expect(next.items.map((item) => item.body)).toEqual(['satu']);
    });
  });

  // -------------------------------------------------------------------------
  // E11-T05 — message safety. PRD §15.5.
  // -------------------------------------------------------------------------

  describe('message safety', () => {
    it('never withholds a message, even at L3', async () => {
      const { roomId, requesterId } = await makeRoom();
      provider.risk = { riskScores: { self_harm: 0.9 }, ambiguous: false };

      const { message } = await messages.create({
        userId: requesterId,
        roomId,
        body: 'rasanya pengin berhenti aja',
      });
      const verdict = await safety.assess({
        messageId: message.id,
        senderId: requesterId,
        text: 'rasanya pengin berhenti aja',
      });

      expect(verdict.level).toBe('L3');
      expect(verdict.intervention).toBeDefined();

      // The message stays, and so does the room.
      const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(stored.safetyLevel).toBe('L3');
      const room = await prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
      expect(room.status).toBe('open');
    });

    it('opens a Critical case at L3 without punishing anyone', async () => {
      const { roomId, requesterId } = await makeRoom();
      provider.risk = { riskScores: { self_harm: 0.95 }, ambiguous: false };

      const { message } = await messages.create({ userId: requesterId, roomId, body: 'berat' });
      await safety.assess({ messageId: message.id, senderId: requesterId, text: 'berat' });

      const opened = await prisma.moderationCase.findFirst({
        where: { targetType: 'message', targetId: message.id },
      });
      expect(opened?.queue).toBe('critical');
      expect(
        await prisma.moderationAction.count({ where: { targetUserId: requesterId } }),
      ).toBe(0);
    });

    it('separates harm aimed at the other person from someone struggling', async () => {
      const { roomId, listenerId } = await makeRoom();
      provider.risk = { riskScores: { harassment: 0.8 }, ambiguous: false };

      const { message } = await messages.create({
        userId: listenerId,
        roomId,
        body: 'kamu tuh gini terus',
      });
      const verdict = await safety.assess({
        messageId: message.id,
        senderId: listenerId,
        text: 'kamu tuh gini terus',
      });

      expect(verdict.level).toBe('L2');
      expect(verdict.targetDirected).toBe(true);

      const opened = await prisma.moderationCase.findFirstOrThrow({
        where: { targetType: 'message', targetId: message.id },
      });
      // Aimed at someone: High. Someone in pain would be Medium.
      expect(opened.queue).toBe('high');
    });

    it('falls back to the local rules when the classifier is unavailable', async () => {
      const { roomId, requesterId } = await makeRoom();
      const { message } = await messages.create({
        userId: requesterId,
        roomId,
        body: 'aku mau bunuh diri malam ini',
      });

      const verdict = await safety.assess({
        messageId: message.id,
        senderId: requesterId,
        text: 'aku mau bunuh diri malam ini',
      });

      // The scripted provider answers cleanly, so the local rules are what
      // pushes this to L3 — the override that must survive a quiet classifier.
      expect(verdict.level).toBe('L3');
    });

    it('logs the verdict without keeping the message next to it', async () => {
      const { roomId, requesterId } = await makeRoom();
      const secret = 'kata rahasia yang tidak boleh bocor';

      const { message } = await messages.create({ userId: requesterId, roomId, body: secret });
      await safety.assess({ messageId: message.id, senderId: requesterId, text: secret });

      const event = await prisma.safetyEvent.findFirstOrThrow({
        where: { targetType: 'message', targetId: message.id },
      });
      expect(JSON.stringify(event)).not.toContain('rahasia');
    });
  });

  // -------------------------------------------------------------------------
  // E11-T04 — presence and typing
  // -------------------------------------------------------------------------

  describe('presence', () => {
    it('expires instead of trusting a disconnect to clean up', async () => {
      const { roomId, requesterId } = await makeRoom();

      await presence.touch(roomId, requesterId);
      expect(await presence.isOnline(roomId, requesterId)).toBe(true);

      const ttl = await redis.ttl(`presence:${roomId}:${requesterId}`);
      // A dropped connection never runs cleanup, so the entry has to time out.
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(45);

      await presence.leave(roomId, requesterId);
      expect(await presence.isOnline(roomId, requesterId)).toBe(false);
    });

    it('throttles typing to one broadcast per window', async () => {
      const { roomId, requesterId } = await makeRoom();

      expect(await presence.allowTyping(roomId, requesterId)).toBe(true);
      expect(await presence.allowTyping(roomId, requesterId)).toBe(false);

      await redis.del(`typing:${roomId}:${requesterId}`);
    });
  });

  // -------------------------------------------------------------------------
  // E11-T07 — closing. Includes the E10 debt that comes due here.
  // -------------------------------------------------------------------------

  describe('closing a session', () => {
    it('lets either side end it and records who did', async () => {
      const first = await makeRoom();
      expect((await rooms.close(first.requesterId, first.roomId)).endReason).toBe(
        'requester_ended',
      );

      const second = await makeRoom();
      expect((await rooms.close(second.listenerId, second.roomId)).endReason).toBe(
        'listener_ended',
      );
    });

    it('advances the listener burnout counters', async () => {
      const { roomId, listenerId, requesterId } = await makeRoom();
      await redis.del(`listener:available`);

      const before = await burnout.state(listenerId);
      await rooms.close(requesterId, roomId);
      const after = await burnout.state(listenerId);

      // Without this call the caps E10 built would never advance in
      // production (E10-T09).
      expect(after.sessionsToday).toBe(before.sessionsToday + 1);
      expect(after.cooldownUntil).toBeInstanceOf(Date);

      const counter = await prisma.listenerSessionCounter.findUniqueOrThrow({
        where: {
          userId_date: { userId: listenerId, date: new Date(`${wibDayKey()}T00:00:00.000Z`) },
        },
      });
      expect(counter.lastSessionEndedAt).toBeInstanceOf(Date);
    });

    it('counts a session exactly once even if close is called twice', async () => {
      const { roomId, listenerId, requesterId } = await makeRoom();

      await rooms.close(requesterId, roomId);
      const afterFirst = await burnout.state(listenerId);
      await rooms.finalise(roomId, 'idle_timeout');
      const afterSecond = await burnout.state(listenerId);

      expect(afterSecond.sessionsToday).toBe(afterFirst.sessionsToday);
    });

    it('closes rooms that have gone quiet', async () => {
      const { roomId } = await makeRoom();

      // Older than the idle window, with nothing said in it.
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { createdAt: new Date(Date.now() - 3 * 3_600_000) },
      });

      await rooms.closeIdleRooms();

      const room = await prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
      expect(room.status).toBe('closed');
      const session = await prisma.listenerSession.findFirstOrThrow({ where: { roomId } });
      expect(session.endReason).toBe('idle_timeout');
    });

    it('leaves an active conversation alone', async () => {
      const { roomId, requesterId } = await makeRoom();
      await prisma.chatRoom.update({
        where: { id: roomId },
        data: { createdAt: new Date(Date.now() - 3 * 3_600_000) },
      });
      await messages.create({ userId: requesterId, roomId, body: 'masih di sini' });

      await rooms.closeIdleRooms();

      expect((await prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe(
        'open',
      );
    });
  });

  // -------------------------------------------------------------------------
  // E11-T08 — feedback
  // -------------------------------------------------------------------------

  describe('session feedback', () => {
    it('routes the requester’s answer through Felt Heard', async () => {
      const { roomId, requesterId, sessionId } = await makeRoom();
      await rooms.close(requesterId, roomId);

      const result = await rooms.feedback(requesterId, roomId, { feltHeard: 'yes' });

      expect(result.recorded).toBe(true);
      const feedback = await prisma.feltHeardFeedback.findFirstOrThrow({
        where: { userId: requesterId, sessionId },
      });
      expect(feedback.answer).toBe('yes');
    });

    it('opens a review when the listener did not feel safe', async () => {
      const { roomId, listenerId, requesterId, sessionId } = await makeRoom();
      await rooms.close(listenerId, roomId);

      const result = await rooms.feedback(listenerId, roomId, {
        feltSafe: false,
        note: 'dia terus minta kontak pribadi',
      });

      expect(result.message).toContain('Makasih udah mau dengerin');
      const session = await prisma.listenerSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.listenerFeltSafe).toBe(false);

      const opened = await prisma.moderationCase.findFirst({
        where: { targetType: 'user', targetId: requesterId },
      });
      expect(opened?.queue).toBe('high');
    });

    it('does not lock anyone into the feedback screen', async () => {
      const { roomId, listenerId } = await makeRoom();
      await rooms.close(listenerId, roomId);

      // Skipping it is simply never calling the endpoint; the session is
      // already closed and nothing is pending.
      const session = await prisma.listenerSession.findFirstOrThrow({ where: { roomId } });
      expect(session.endedAt).toBeInstanceOf(Date);
      expect(session.listenerFeltSafe).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // E11-T06, T09 — notice, room list, block
  // -------------------------------------------------------------------------

  describe('room surface', () => {
    it('shows the safety notice once and tells the truth about screenshots', async () => {
      const { roomId, requesterId } = await makeRoom();

      const first = await rooms.detail(requesterId, roomId);
      expect(first.showSafetyNotice).toBe(true);
      expect(first.safetyNotice).toContain('dipantau sistem keamanan otomatis');
      // PRD §15: never promise screenshots are impossible.
      expect(first.safetyNotice).toContain('tidak bisa menjaminnya');

      await rooms.acknowledgeNotice(requesterId, roomId);
      expect((await rooms.detail(requesterId, roomId)).showSafetyNotice).toBe(false);
    });

    it('lists rooms without a shred of message content', async () => {
      const { roomId, requesterId } = await makeRoom();
      await messages.create({ userId: requesterId, roomId, body: 'isi yang sangat pribadi' });

      const list = await rooms.list(requesterId);
      const entry = list.find((room) => room.roomId === roomId);

      expect(entry).toBeDefined();
      expect(Object.keys(entry ?? {})).toEqual([
        'roomId',
        'role',
        'status',
        'counterpartAlias',
        'lastActivityAt',
      ]);
      expect(JSON.stringify(list)).not.toContain('pribadi');
    });

    it('ends the session on block and keeps the two apart afterwards', async () => {
      const { roomId, requesterId, listenerId } = await makeRoom();

      await rooms.blockCounterpart(requesterId, roomId);

      const room = await prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
      expect(room.status).toBe('closed');
      const session = await prisma.listenerSession.findFirstOrThrow({ where: { roomId } });
      expect(session.endReason).toBe('blocked');

      // The matching filter reads this both ways (E10-T05), so they can never
      // be paired again.
      const block = await prisma.blockedUser.findFirst({
        where: { blockerId: requesterId, blockedId: listenerId },
      });
      expect(block).not.toBeNull();
    });
  });
});
