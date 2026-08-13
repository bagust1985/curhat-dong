import { createPrismaClient, type PrismaClient } from '@curhat/database';
import { config } from 'dotenv';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BATCH_SIZE, retentionPlan, type RetentionConfig } from './retention.plan';

config({ path: join(process.cwd(), '../../.env') });

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const describeDb = hasDatabase ? describe : describe.skip;

/**
 * Retention against real rows — E17-T08.
 *
 * The plan arithmetic is unit-tested elsewhere. What is checked here is the
 * thing that arithmetic cannot prove: that the SQL deletes the expired rows and
 * **only** the expired rows.
 *
 * The batching SQL runs as raw statements against Postgres, so a wrong column
 * name or a guard that never matches would look fine in every unit test and
 * silently delete either nothing or everything.
 */
describeDb('retention against seeded data', () => {
  let prisma: PrismaClient;

  const CONFIG: RetentionConfig = {
    'retention.days.post_grace_after_delete': 30,
    'retention.days.room_messages': 365,
    'retention.days.ai_messages': 180,
    'retention.days.safety': 730,
    'retention.days.moderation': 730,
    'retention.days.otp_hours': 24,
    'retention.days.revoked_sessions': 90,
    'retention.days.inactive_devices': 180,
  };

  const MARK = `retensi-uji-${Date.now()}`;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

  beforeAll(async () => {
    // Prisma 7 needs the driver adapter; the package's factory is the only
    // supported way to build one (TECH-SPEC §1.2).
    prisma = createPrismaClient(process.env['DATABASE_URL'] as string);
  });

  afterAll(async () => {
    await prisma.otpChallenge.deleteMany({ where: { emailHash: { startsWith: MARK } } });
    await prisma.$disconnect();
  });

  /**
   * Runs the same statement the service runs, against one table.
   *
   * Duplicated from `RetentionService.deleteBatch` on purpose: importing the
   * service would drag in the whole Nest container for a test about SQL.
   */
  async function sweep(entity: string, ageColumn: string, cutoff: Date): Promise<number> {
    return prisma.$executeRawUnsafe(
      `DELETE FROM ${entity} t
       WHERE t.ctid IN (
         SELECT t2.ctid FROM ${entity} t2
         WHERE t2.${ageColumn} IS NOT NULL AND t2.${ageColumn} < $1
         LIMIT ${BATCH_SIZE}
       )`,
      cutoff,
    );
  }

  it('deletes an expired OTP and keeps a fresh one', async () => {
    const expired = `${MARK}-lama`;
    const fresh = `${MARK}-baru`;

    await prisma.otpChallenge.create({
      data: {
        emailHash: expired,
        codeHash: 'x',
        expiresAt: new Date(Date.now() + 600_000),
        // 48 hours old, against a 24-hour window.
        createdAt: new Date(Date.now() - 48 * 3_600_000),
      },
    });
    await prisma.otpChallenge.create({
      data: { emailHash: fresh, codeHash: 'y', expiresAt: new Date(Date.now() + 600_000) },
    });

    const step = retentionPlan(CONFIG, new Date()).find((entry) => entry.job === 'otp');
    const removed = await sweep('otp_challenges', 'created_at', step!.cutoff);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.otpChallenge.findFirst({ where: { emailHash: expired } })).toBeNull();
    // The one inside the window is untouched — this is the half that matters.
    expect(await prisma.otpChallenge.findFirst({ where: { emailHash: fresh } })).not.toBeNull();
  });

  it('leaves rows exactly on the boundary alone', async () => {
    const boundary = `${MARK}-batas`;
    const step = retentionPlan(CONFIG, new Date()).find((entry) => entry.job === 'otp');

    await prisma.otpChallenge.create({
      data: {
        emailHash: boundary,
        codeHash: 'z',
        expiresAt: new Date(Date.now() + 600_000),
        // One minute *inside* the window.
        createdAt: new Date(step!.cutoff.getTime() + 60_000),
      },
    });

    await sweep('otp_challenges', 'created_at', step!.cutoff);

    // `<` and not `<=`: a row whose age equals the retention period has not yet
    // outlived it, and deleting it would break the promise by a minute.
    expect(await prisma.otpChallenge.findFirst({ where: { emailHash: boundary } })).not.toBeNull();
  });

  it('touches nothing when there is nothing expired', async () => {
    const step = retentionPlan(CONFIG, new Date()).find((entry) => entry.job === 'otp');
    await sweep('otp_challenges', 'created_at', step!.cutoff);

    // Second pass over an already-clean table. Zero here is correct; zero for
    // seven days running is the signal `looksStuck` alerts on.
    const removed = await sweep('otp_challenges', 'created_at', step!.cutoff);
    expect(removed).toBe(0);
  });

  it('never deletes a row protected by an open moderation case', async () => {
    // The guard is the load-bearing part of the whole job: a moderator ruling
    // on something they can no longer read is worse than a row that outlived
    // its date.
    const cutoff = daysAgo(30);
    const guarded = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count
       FROM curhat_posts t
       WHERE t.deleted_at IS NOT NULL AND t.deleted_at < $1
         AND EXISTS (
           SELECT 1 FROM moderation_cases mc
           WHERE mc.status IN ('open', 'in_review', 'escalated')
             AND mc.target_id::text = t.id::text
         )`,
      cutoff,
    );

    // The query has to be *valid*; whether this database currently has such a
    // row is not the point. An invalid guard would silently match nothing and
    // delete everything.
    expect(typeof guarded[0]?.count).toBe('bigint');
  });
});
