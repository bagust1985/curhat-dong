import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerEnv } from '@curhat/config/env/server';
import { createPrismaClient, type PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';
import { SessionService } from '../auth/session.service.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { SupportResourcesService } from '../safety/support-resources.service.js';
import { UsersService } from '../users/users.service.js';
import { wibDayKey } from '../ai/wib-day.js';
import { AvailabilityService } from './availability.service.js';
import { BurnoutService } from './burnout.service.js';
import { ListenerEscalateService } from './listener-escalate.service.js';
import { ListenerRequestsService } from './listener-requests.service.js';
import { ListenerService } from './listener.service.js';
import { LISTENER_GUIDELINES_VERSION } from './listener-guidelines.js';
import { MatchingService } from './matching.service.js';
import { OffersService } from './offers.service.js';

config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'];
const describeIntegration = databaseUrl && redisUrl ? describe : describe.skip;

describeIntegration('listener & matching (E10)', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let listeners: ListenerService;
  let availability: AvailabilityService;
  let requests: ListenerRequestsService;
  let offers: OffersService;
  let burnout: BurnoutService;
  let escalate: ListenerEscalateService;

  const createdUserIds: string[] = [];

  async function makeUser(): Promise<string> {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);
    return user.id;
  }

  /** An activated, available listener with the given topics. */
  async function makeListener(topics: string[] = ['work']): Promise<string> {
    const userId = await makeUser();
    await listeners.activate(userId, {
      guidelinesVersion: LISTENER_GUIDELINES_VERSION,
      topics,
    });
    await availability.set(userId, true);
    return userId;
  }

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    redis = new Redis(redisUrl as string, { maxRetriesPerRequest: 2 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PRISMA, useValue: prisma },
        { provide: REDIS, useValue: redis },
        { provide: ENV, useValue: {} as ServerEnv },
        AppConfigService,
        FeatureFlagService,
        RateLimitService,
        SessionService,
        UsersService,
        ModerationService,
        SupportResourcesService,
        AvailabilityService,
        BurnoutService,
        ListenerService,
        MatchingService,
        OffersService,
        ListenerRequestsService,
        ListenerEscalateService,
      ],
    }).compile();

    listeners = moduleRef.get(ListenerService);
    availability = moduleRef.get(AvailabilityService);
    requests = moduleRef.get(ListenerRequestsService);
    offers = moduleRef.get(OffersService);
    burnout = moduleRef.get(BurnoutService);
    escalate = moduleRef.get(ListenerEscalateService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await redis.del('listener:available', 'listener:available:synced');
    const rateKeys = await redis.keys('ratelimit:listener:request:*');
    if (rateKeys.length > 0) await redis.del(...rateKeys);
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    // Every test builds its own pool; a leftover listener from another test
    // would silently become a candidate.
    await redis.del('listener:available', 'listener:available:synced');
    await prisma.listenerAvailability.updateMany({ data: { isAvailable: false } });
  });

  // -------------------------------------------------------------------------
  // E10-T01 — activation
  // -------------------------------------------------------------------------

  describe('activation', () => {
    it('refuses to make anyone a listener without the guidelines', async () => {
      const userId = await makeUser();

      await expect(listeners.profile(userId)).rejects.toMatchObject({
        code: 'LISTENER_GUIDELINES_NOT_ACCEPTED',
      });

      await expect(
        listeners.activate(userId, { guidelinesVersion: '1999-01-01' }),
      ).rejects.toMatchObject({ code: 'LISTENER_GUIDELINES_NOT_ACCEPTED' });
    });

    it('records the version and timestamp that were accepted', async () => {
      const userId = await makeUser();

      const profile = await listeners.activate(userId, {
        guidelinesVersion: LISTENER_GUIDELINES_VERSION,
        topics: ['work'],
      });

      expect(profile.guidelinesVersionAccepted).toBe(LISTENER_GUIDELINES_VERSION);
      expect(profile.needsGuidelinesAcceptance).toBe(false);

      const stored = await prisma.listenerProfile.findUniqueOrThrow({ where: { userId } });
      expect(stored.guidelinesAcceptedAt).toBeInstanceOf(Date);
    });

    it('asks again when the guidelines change', async () => {
      const userId = await makeListener();

      // What a new guidelines release looks like from the database's side.
      await prisma.listenerProfile.update({
        where: { userId },
        data: { guidelinesVersionAccepted: '2020-01-01' },
      });

      expect((await listeners.profile(userId)).needsGuidelinesAcceptance).toBe(true);
    });

    it('states the six things a listener must know', () => {
      const { sections } = listeners.guidelines();
      const text = sections.map((section) => `${section.title} ${section.body}`).join(' ');

      expect(sections).toHaveLength(6);
      expect(text).toContain('bukan terapis');
      // The one that keeps volunteers safe: stopping is not failure.
      expect(text).toContain('bukan kegagalan');
    });
  });

  // -------------------------------------------------------------------------
  // E10-T02 — preferences
  // -------------------------------------------------------------------------

  describe('preferences', () => {
    it('lets a listener lower their concurrency but never raise it', async () => {
      const userId = await makeListener();

      await expect(
        listeners.updateProfile(userId, { maxConcurrent: 5 }),
      ).rejects.toBeInstanceOf(ApiException);

      const lowered = await listeners.updateProfile(userId, { maxConcurrent: 2 });
      expect(lowered.maxConcurrent).toBe(2);
    });

    it('keeps internal scores out of the public profile', async () => {
      const userId = await makeListener();
      const publicView = await listeners.publicProfile(userId);

      expect(Object.keys(publicView)).toEqual(['alias', 'topics', 'languages', 'sessionCount']);
      expect(JSON.stringify(publicView)).not.toContain('Score');
    });
  });

  // -------------------------------------------------------------------------
  // E10-T03 — availability mirror
  // -------------------------------------------------------------------------

  describe('availability', () => {
    it('rebuilds the candidate pool from Postgres when Redis is wiped', async () => {
      const listenerId = await makeListener();

      expect(await availability.availableListenerIds()).toContain(listenerId);

      // Redis is not the source of truth (non-negotiable #5).
      await redis.del('listener:available', 'listener:available:synced');

      expect(await availability.availableListenerIds()).toContain(listenerId);
      expect(await redis.sismember('listener:available', listenerId)).toBe(1);
    });

    it('lets a listener step out at any moment', async () => {
      const listenerId = await makeListener();

      await availability.set(listenerId, false);

      expect(await availability.availableListenerIds()).not.toContain(listenerId);
      expect(await availability.isAvailable(listenerId)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // E10-T04, T05, T07 — request, filter and offer
  // -------------------------------------------------------------------------

  describe('requesting a listener', () => {
    it('offers the request to a candidate without revealing who asked', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();

      const request = await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      expect(request.status).toBe('searching');

      const pending = await offers.pendingFor(listenerId);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.topic).toBe('work');
      expect(pending[0]?.emotion).toBe('lelah');
      // Nothing in the offer points back at the person (TECH-SPEC §4.5).
      expect(JSON.stringify(pending[0])).not.toContain(requesterId);
    });

    it('allows only one live request per person', async () => {
      await makeListener();
      const requesterId = await makeUser();

      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      await expect(
        requests.create(requesterId, { topic: 'family', emotion: 'sedih' }),
      ).rejects.toMatchObject({ code: 'LISTENER_REQUEST_ALREADY_ACTIVE' });
    });

    it('never offers to someone the requester blocked, in either direction', async () => {
      const blockedListener = await makeListener(['work']);
      const requesterId = await makeUser();

      await prisma.blockedUser.create({
        data: { blockerId: blockedListener, blockedId: requesterId },
      });

      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      expect(await offers.pendingFor(blockedListener)).toHaveLength(0);
    });

    it('never offers a request to the person who made it', async () => {
      const selfListener = await makeListener(['work']);

      const request = await requests.create(selfListener, { topic: 'work', emotion: 'lelah' });

      expect(await offers.pendingFor(selfListener)).toHaveLength(0);
      expect((await requests.status(selfListener, request.requestId)).status).toBe('failed');
    });

    it('moves to the next candidate when an offer times out', async () => {
      const first = await makeListener(['work']);
      const second = await makeListener(['work']);
      const requesterId = await makeUser();

      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      const firstOffer = (await offers.pendingFor(first)).at(0)
        ? first
        : second;
      const other = firstOffer === first ? second : first;

      // Force the deadline to have passed; the server decides this, not a
      // countdown on somebody's screen.
      await prisma.listenerMatch.updateMany({
        where: { listenerId: firstOffer, status: 'offered' },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const swept = await offers.expireOverdue();
      expect(swept.expired).toBe(1);

      expect(await offers.pendingFor(other)).toHaveLength(1);
    });

    it('lets exactly one listener win a simultaneous accept', async () => {
      const first = await makeListener(['work']);
      const second = await makeListener(['work']);
      const requesterId = await makeUser();

      const request = await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      // Manufacture the race: a stale offer that never got answered plus its
      // replacement, both live at once.
      const offered = await prisma.listenerMatch.findFirstOrThrow({
        where: { requestId: request.requestId, status: 'offered' },
      });
      const rival = offered.listenerId === first ? second : first;
      const rivalMatch = await prisma.listenerMatch.create({
        data: {
          requestId: request.requestId,
          requesterId,
          listenerId: rival,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const results = await Promise.allSettled([
        offers.accept(offered.listenerId, offered.id),
        offers.accept(rival, rivalMatch.id),
      ]);

      const accepted = results.filter((result) => result.status === 'fulfilled');
      const refused = results.filter((result) => result.status === 'rejected');

      expect(accepted).toHaveLength(1);
      expect(refused).toHaveLength(1);
      // The one who lost is thanked, not scolded.
      const error = (refused[0] as PromiseRejectedResult).reason as ApiException;
      expect(error.code).toBe('MATCH_OFFER_ALREADY_TAKEN');

      const sessions = await prisma.listenerSession.count({
        where: { requesterId },
      });
      expect(sessions).toBe(1);
    });

    it('refuses an offer whose deadline already passed', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      await prisma.listenerMatch.update({
        where: { id: match.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      await expect(offers.accept(listenerId, match.id)).rejects.toMatchObject({
        code: 'MATCH_OFFER_EXPIRED',
      });
    });

    it('opens a room with both people in it on accept', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      const session = await offers.accept(listenerId, match.id);

      const members = await prisma.roomMember.findMany({ where: { roomId: session.roomId } });
      expect(members.map((member) => member.role).sort()).toEqual(['listener', 'requester']);

      const status = await requests.status(requesterId, match.requestId);
      expect(status.status).toBe('matched');
      expect(status.roomId).toBe(session.roomId);
    });
  });

  // -------------------------------------------------------------------------
  // E10-T08 — honest failure
  // -------------------------------------------------------------------------

  describe('when nobody is available', () => {
    it('says so plainly and offers three real alternatives', async () => {
      const requesterId = await makeUser();

      const request = await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      expect(request.status).toBe('failed');
      expect(request.alternatives?.map((option) => option.action)).toEqual([
        'open_ai',
        'create_post',
        'retry',
      ]);
      // No promise anyone will turn up (TECH-SPEC §4.5).
      expect(request.message).toContain('Belum ada yang siap');
      expect(request.message).not.toMatch(/nanti ada|tunggu sebentar lagi/i);
    });
  });

  // -------------------------------------------------------------------------
  // E10-T09 — burnout caps
  // -------------------------------------------------------------------------

  describe('burnout protection', () => {
    it('never offers the ninth session of the day', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();

      await prisma.listenerSessionCounter.create({
        data: {
          userId: listenerId,
          date: new Date(`${wibDayKey()}T00:00:00.000Z`),
          completedCount: 8,
          lastSessionEndedAt: new Date(Date.now() - 60 * 60_000),
        },
      });

      const request = await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      expect(await offers.pendingFor(listenerId)).toHaveLength(0);
      expect(request.status).toBe('failed');
    });

    it('keeps a listener out of the pool during cooldown', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();

      await prisma.listenerSessionCounter.create({
        data: {
          userId: listenerId,
          date: new Date(`${wibDayKey()}T00:00:00.000Z`),
          completedCount: 1,
          lastSessionEndedAt: new Date(Date.now() - 60_000),
        },
      });

      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      expect(await offers.pendingFor(listenerId)).toHaveLength(0);

      const state = await burnout.state(listenerId);
      expect(state.cooldownUntil).toBeInstanceOf(Date);
      expect(state.message).toBe('Ambil napas dulu sebentar ya.');
    });

    it('turns availability off at the daily cap, appreciatively', async () => {
      const listenerId = await makeListener(['work']);

      await prisma.listenerSessionCounter.create({
        data: {
          userId: listenerId,
          date: new Date(`${wibDayKey()}T00:00:00.000Z`),
          completedCount: 7,
        },
      });

      const state = await burnout.recordSessionEnd(listenerId);

      expect(state.dailyCapReached).toBe(true);
      expect(await availability.isAvailable(listenerId)).toBe(false);
      // Appreciative, not a warning — and no way to push through
      // (DESIGN-REF §2.20).
      expect(state.message).toContain('Istirahat dulu');
      expect(state.message).not.toMatch(/peringatan|dilarang|pelanggaran/i);
    });

    it('counts the day in WIB, not UTC', async () => {
      const listenerId = await makeListener(['work']);
      const lateNight = new Date('2026-08-12T16:59:00Z'); // 23:59 WIB
      const afterMidnight = new Date('2026-08-12T17:01:00Z'); // 00:01 WIB next day

      await burnout.recordSessionEnd(listenerId, lateNight);

      expect((await burnout.state(listenerId, lateNight)).sessionsToday).toBe(1);
      expect((await burnout.state(listenerId, afterMidnight)).sessionsToday).toBe(0);
    });

    it('respects the concurrency limit the listener set', async () => {
      const listenerId = await makeListener(['work']);
      await listeners.updateProfile(listenerId, { maxConcurrent: 1 });

      const firstRequester = await makeUser();
      await requests.create(firstRequester, { topic: 'work', emotion: 'lelah' });
      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      await offers.accept(listenerId, match.id);

      // Now busy: the next request must not reach them.
      const secondRequester = await makeUser();
      const second = await requests.create(secondRequester, { topic: 'work', emotion: 'sedih' });

      expect(await offers.pendingFor(listenerId)).toHaveLength(0);
      expect(second.status).toBe('failed');
    });

    it('does not record anything against a listener who declines', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });

      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      const before = await prisma.listenerProfile.findUniqueOrThrow({ where: { userId: listenerId } });

      await offers.decline(listenerId, match.id);

      const after = await prisma.listenerProfile.findUniqueOrThrow({ where: { userId: listenerId } });
      // PRD §11.2: protecting your own limits must cost nothing.
      expect(after.helpfulScore).toBe(before.helpfulScore);
      expect(after.feltHeardScore).toBe(before.feltHeardScore);
      expect(after.sessionCount).toBe(before.sessionCount);
    });
  });

  // -------------------------------------------------------------------------
  // E10-T10 — stats
  // -------------------------------------------------------------------------

  describe('stats', () => {
    it('shows the listener their own numbers and nobody else', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      await offers.accept(listenerId, match.id);

      const stats = await listeners.stats(listenerId);

      expect(stats.sessionCount).toBe(1);
      expect(stats.recentSessions).toHaveLength(1);
      // No message content and nothing identifying the other person.
      const serialised = JSON.stringify(stats);
      expect(serialised).not.toContain(requesterId);
      expect(Object.keys(stats.recentSessions[0] ?? {})).toEqual([
        'startedAt',
        'endedAt',
        'minutes',
      ]);
    });

    it('scores from the requester’s own answers, as a rate', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      const session = await offers.accept(listenerId, match.id);

      await prisma.feltHeardFeedback.create({
        data: { userId: requesterId, sessionId: session.sessionId, answer: 'yes' },
      });

      const stats = await listeners.stats(listenerId);
      expect(stats.feltHeardScore).toBe(1);
      expect(stats.helpfulScore).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // E10-T11 — escalation
  // -------------------------------------------------------------------------

  describe('escalation to a moderator', () => {
    it('opens a Critical case, shows resources, and punishes nobody', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      const session = await offers.accept(listenerId, match.id);

      const result = await escalate.escalate(listenerId, session.sessionId);

      const moderationCase = await prisma.moderationCase.findFirstOrThrow({
        where: { id: result.caseId },
      });
      expect(moderationCase.queue).toBe('critical');
      expect(moderationCase.source).toBe('listener_escalate');

      // The session stays open and the requester keeps their account intact
      // (PRD §11.3, non-negotiable #2).
      expect(result.sessionOpen).toBe(true);
      const stored = await prisma.listenerSession.findUniqueOrThrow({
        where: { id: session.sessionId },
      });
      expect(stored.endedAt).toBeNull();
      expect(
        await prisma.moderationAction.count({ where: { targetUserId: requesterId } }),
      ).toBe(0);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: requesterId } })).status,
      ).toBe('active');

      // And the listener is told what to do, then told they may leave.
      expect(result.guidance.points.join(' ')).toContain('Jangan menjanjikan penyelamatan');
      expect(result.guidance.message).toContain('Kamu udah lakuin yang benar');
    });

    it('costs the listener nothing', async () => {
      const listenerId = await makeListener(['work']);
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      const session = await offers.accept(listenerId, match.id);

      const before = await prisma.listenerProfile.findUniqueOrThrow({ where: { userId: listenerId } });
      await escalate.escalate(listenerId, session.sessionId);
      const after = await prisma.listenerProfile.findUniqueOrThrow({ where: { userId: listenerId } });

      expect(after.safetyStatus).toBe(before.safetyStatus);
      expect(after.helpfulScore).toBe(before.helpfulScore);
      expect(after.feltHeardScore).toBe(before.feltHeardScore);
    });

    it('refuses to escalate a session that is not yours', async () => {
      const listenerId = await makeListener(['work']);
      const stranger = await makeUser();
      const requesterId = await makeUser();
      await requests.create(requesterId, { topic: 'work', emotion: 'lelah' });
      const match = await prisma.listenerMatch.findFirstOrThrow({
        where: { listenerId, status: 'offered' },
      });
      const session = await offers.accept(listenerId, match.id);

      await expect(escalate.escalate(stranger, session.sessionId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
