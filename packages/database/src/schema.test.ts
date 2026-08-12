import { config } from 'dotenv';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type PrismaClient } from './client.js';
import { APP_CONFIG_DEFAULTS, SEED_CATEGORIES } from './config-defaults.js';

// vitest runs with packages/database as cwd.
config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];

/**
 * These tests run against the real database — the guarantees under test are
 * database constraints, and asserting them against a mock would prove nothing.
 */
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('schema constraints', () => {
  let prisma: PrismaClient;
  const created: string[] = [];

  async function makeUser(): Promise<string> {
    const user = await prisma.user.create({ data: {} });
    created.push(user.id);
    return user.id;
  }

  beforeAll(() => {
    prisma = createPrismaClient(databaseUrl as string);
  });

  afterAll(async () => {
    if (created.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: created } } });
    }
    await prisma.$disconnect();
  });

  describe('block (PRD §15)', () => {
    it('refuses a self-block', async () => {
      const id = await makeUser();
      await expect(
        prisma.blockedUser.create({ data: { blockerId: id, blockedId: id } }),
      ).rejects.toThrow();
    });

    it('is stored once per direction', async () => {
      const a = await makeUser();
      const b = await makeUser();
      await prisma.blockedUser.create({ data: { blockerId: a, blockedId: b } });
      await expect(
        prisma.blockedUser.create({ data: { blockerId: a, blockedId: b } }),
      ).rejects.toThrow();
    });
  });

  describe('listener burnout caps (PRD §11.2)', () => {
    it('refuses raising max_concurrent above the platform default', async () => {
      const id = await makeUser();
      await expect(
        prisma.listenerProfile.create({ data: { userId: id, maxConcurrent: 5 } }),
      ).rejects.toThrow();
    });

    it('allows a listener to lower their own limit', async () => {
      const id = await makeUser();
      const profile = await prisma.listenerProfile.create({
        data: { userId: id, maxConcurrent: 1 },
      });
      expect(profile.maxConcurrent).toBe(1);
    });
  });

  describe('Felt Heard prompt (PRD §9)', () => {
    it('refuses a prompt that is both answered and dismissed', async () => {
      // Conflating the two would let a dismissal be read as "no" and poison
      // the North Star metric.
      const id = await makeUser();
      await expect(
        prisma.feltHeardPrompt.create({
          data: {
            userId: id,
            targetType: 'post',
            targetId: crypto.randomUUID(),
            answer: 'no',
            dismissed: true,
          },
        }),
      ).rejects.toThrow();
    });

    it('allows at most one prompt per target', async () => {
      const id = await makeUser();
      const targetId = crypto.randomUUID();
      await prisma.feltHeardPrompt.create({
        data: { userId: id, targetType: 'post', targetId },
      });
      await expect(
        prisma.feltHeardPrompt.create({ data: { userId: id, targetType: 'post', targetId } }),
      ).rejects.toThrow();
    });
  });

  describe('support resources (PRD §15.2)', () => {
    it('refuses to activate an entry with no official source', async () => {
      // A dead hotline is worse than showing nothing: someone in crisis tries
      // it, fails, and feels more alone.
      await expect(
        prisma.supportResource.create({
          data: {
            name: 'Uji',
            channel: 'phone',
            value: '000',
            hours: '24/7',
            isActive: true,
            verifiedAt: new Date(),
            sourceUrl: '   ',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('comment nesting (PRD §9)', () => {
    it('refuses a reply to a reply', async () => {
      const authorId = await makeUser();
      const category = await prisma.postCategory.findFirstOrThrow();

      const post = await prisma.curhatPost.create({
        data: {
          authorId,
          categoryId: category.id,
          body: 'uji nesting',
          mood: 'bingung',
          intent: 'cuma_didengar',
          status: 'published',
          safetyLevel: 'L0',
        },
      });

      const top = await prisma.comment.create({
        data: { postId: post.id, authorId, body: 'komentar' },
      });
      const reply = await prisma.comment.create({
        data: { postId: post.id, authorId, body: 'balasan', parentId: top.id },
      });

      await expect(
        prisma.comment.create({
          data: { postId: post.id, authorId, body: 'balasan ke balasan', parentId: reply.id },
        }),
      ).rejects.toThrow(/one level/i);
    });
  });

  describe('privacy shape (CLAUDE.md non-negotiable #4)', () => {
    it('keeps identity fields out of the public profile model', async () => {
      const id = await makeUser();
      const profile = await prisma.userProfile.create({
        data: { userId: id, alias: `Uji${Date.now()}`, aliasLower: `uji${Date.now()}` },
      });

      // Everything on UserProfile may appear in a public API response, so
      // nothing identifying may live on it.
      const keys = Object.keys(profile);
      for (const forbidden of ['email', 'emailHash', 'providerId', 'phone', 'trustScore']) {
        expect(keys).not.toContain(forbidden);
      }
    });

    it('keeps the trust score off the profile and on an internal table', async () => {
      const id = await makeUser();
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user).toHaveProperty('trustScoreInternal');

      const profile = await prisma.userProfile.findUnique({ where: { userId: id } });
      expect(profile).toBeNull();
    });
  });
});

describe('seeded configuration', () => {
  it('covers every value recapped in PRD §25.7', () => {
    const keys = Object.keys(APP_CONFIG_DEFAULTS);
    for (const expected of [
      'ai.messages_per_day',
      'felt_heard.max_per_day',
      'listener.max_sessions_per_day',
      'moderation.sla_minutes.critical_night',
      'appeal.window_days',
      'notification.quiet_hours_start',
      'retention.days.room_messages',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('keeps the night SLA tighter than four hours for critical cases', () => {
    // Peak usage is at night, so the quietest moderator hours are the busiest
    // crisis hours (PRD §15.3).
    expect(APP_CONFIG_DEFAULTS['moderation.sla_minutes.critical_night']).toBeLessThanOrEqual(30);
  });

  it('degrades the AI quota rather than removing it', () => {
    expect(APP_CONFIG_DEFAULTS['ai.messages_per_day_degraded']).toBeGreaterThan(0);
    expect(APP_CONFIG_DEFAULTS['ai.messages_per_day_degraded']).toBeLessThan(
      APP_CONFIG_DEFAULTS['ai.messages_per_day'],
    );
  });

  it('starts with the 15 categories from PRD §16', () => {
    expect(SEED_CATEGORIES).toHaveLength(15);
    expect(new Set(SEED_CATEGORIES.map((c) => c.slug)).size).toBe(15);
  });
});
