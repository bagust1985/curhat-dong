import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import type { PrismaClient } from '@curhat/database';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { wibDayKey } from '../ai/wib-day.js';
import { AvailabilityService } from './availability.service.js';
import { ListenerNudgeService } from './listener-nudge.service.js';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

/**
 * E12-T09 — listener nudge rate control.
 *
 * Runs against the real database and Redis: every limit under test is enforced
 * by a counter or a row, and asserting them against a mock would only prove
 * the mock agrees with itself.
 */
describeDb('listener nudge (E12-T09)', () => {
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  let prisma: PrismaClient;
  let redis: {
    status: string;
    keys: (p: string) => Promise<string[]>;
    del: (...k: string[]) => Promise<number>;
    once: (e: string, l: () => void) => unknown;
  };
  let nudge: ListenerNudgeService;
  let availability: AvailabilityService;
  let appConfig: AppConfigService;

  const createdUserIds: string[] = [];

  async function listener(options: { available?: boolean } = {}): Promise<string> {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);

    const alias = `Nudge${user.id.slice(0, 8)}`;
    await prisma.userProfile.create({
      data: { userId: user.id, alias, aliasLower: alias.toLowerCase() },
    });
    await prisma.listenerProfile.create({
      data: {
        userId: user.id,
        guidelinesVersionAccepted: 'v1',
        guidelinesAcceptedAt: new Date(),
      },
    });

    if (options.available !== false) {
      await prisma.listenerAvailability.create({
        data: { userId: user.id, isAvailable: true },
      });
    }

    await availability.rebuild();
    return user.id;
  }

  async function clearNudgeKeys(): Promise<void> {
    const keys = await redis.keys('nudge:*');
    if (keys.length > 0) await redis.del(...keys);
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();

    prisma = moduleRef.get<PrismaClient>(PRISMA);
    redis = moduleRef.get(REDIS);
    nudge = moduleRef.get(ListenerNudgeService);
    availability = moduleRef.get(AvailabilityService);
    appConfig = moduleRef.get(AppConfigService);

    if (redis.status !== 'ready') {
      await new Promise<void>((ready) => redis.once('ready', ready));
    }
  }, 120_000);

  beforeEach(async () => {
    await clearNudgeKeys();
    appConfig.invalidate();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await clearNudgeKeys();
    await moduleRef.close();
  });

  it('nudges an available listener with generic copy only', async () => {
    const listenerId = await listener();

    const result = await nudge.nudgeForWaitingRequester({ sourceId: `post-${Date.now()}` });

    expect(result.notified).toBeGreaterThanOrEqual(1);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: listenerId, type: 'listener' },
    });

    const payload = JSON.stringify(notification.payload);
    expect(payload).toContain('Ada seseorang yang sedang butuh didengar.');
    // No post id, no topic, no alias — a nudge on a lock screen must reveal
    // nothing about who needed help.
    expect(payload).not.toContain('capek');
    expect((notification.payload as { targetId: string | null }).targetId).toBeNull();
  });

  it('does not nudge a listener who has hit their daily cap', async () => {
    const listenerId = await listener();
    const maxPerDay = await appConfig.getNumber('listener.max_sessions_per_day');

    await prisma.listenerSessionCounter.create({
      data: {
        userId: listenerId,
        date: new Date(`${wibDayKey()}T00:00:00.000Z`),
        completedCount: maxPerDay,
      },
    });

    const result = await nudge.nudgeForWaitingRequester({ sourceId: `post-cap-${Date.now()}` });

    expect(result.skipped['daily_cap']).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(0);
  });

  it('does not nudge a listener inside their cooldown', async () => {
    const listenerId = await listener();

    await prisma.listenerSessionCounter.create({
      data: {
        userId: listenerId,
        date: new Date(`${wibDayKey()}T00:00:00.000Z`),
        completedCount: 1,
        lastSessionEndedAt: new Date(),
      },
    });

    const result = await nudge.nudgeForWaitingRequester({ sourceId: `post-cool-${Date.now()}` });

    expect(result.skipped['cooldown']).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(0);
  });

  it('holds a nudge back until the per-listener cooldown has passed', async () => {
    const listenerId = await listener();

    const first = await nudge.nudgeForWaitingRequester({ sourceId: `post-a-${Date.now()}` });
    const second = await nudge.nudgeForWaitingRequester({ sourceId: `post-b-${Date.now()}` });

    expect(first.notified).toBeGreaterThanOrEqual(1);
    // Two different posts, one hour apart by config — the second waits.
    expect(second.notified).toBe(0);
    expect(second.skipped['nudge_cooldown']).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(1);
  });

  it('stops at the daily nudge allowance', async () => {
    const listenerId = await listener();
    const maxPerDay = await appConfig.getNumber('notification.nudge_max_per_day');

    let rateLimited = 0;

    // The cooldown is cleared between attempts so only the daily cap is under
    // test here — the cooldown has its own test above.
    for (let i = 0; i < maxPerDay + 2; i += 1) {
      await redis.del(`nudge:cooldown:${listenerId}`);
      const result = await nudge.nudgeForWaitingRequester({ sourceId: `post-cap-${i}-${Date.now()}` });
      rateLimited += result.skipped['rate_limited'] ?? 0;
    }

    expect(rateLimited).toBeGreaterThanOrEqual(2);
    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(maxPerDay);
  });

  it('never nudges the person who is waiting', async () => {
    const listenerId = await listener();

    await nudge.nudgeForWaitingRequester({
      sourceId: `post-self-${Date.now()}`,
      excludeUserId: listenerId,
    });

    // Other listeners created by this file are still available and are
    // nudged; the assertion that matters is that the excluded one was not.
    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(0);
  });

  it('does not nudge an unavailable listener', async () => {
    const listenerId = await listener({ available: false });

    await nudge.nudgeForWaitingRequester({ sourceId: `post-off-${Date.now()}` });

    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(0);
  });

  it('sends one nudge per listener when the same source fires twice', async () => {
    const listenerId = await listener();
    const sourceId = `post-retry-${Date.now()}`;

    await nudge.nudgeForWaitingRequester({ sourceId });
    await redis.del(`nudge:cooldown:${listenerId}`);
    await nudge.nudgeForWaitingRequester({ sourceId });

    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(1);
  });

  it('matches a listener whose topics are empty to any topic', async () => {
    // An empty topic list means "anything" (E10-T02). Reading it as "nothing"
    // would silently exclude every listener who never opened the settings.
    const listenerId = await listener();

    const result = await nudge.nudgeForWaitingRequester({
      sourceId: `post-topic-${Date.now()}`,
      topic: 'finance',
    });

    expect(result.notified).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.notification.count({ where: { userId: listenerId, type: 'listener' } }),
    ).toBe(1);
  });
});
