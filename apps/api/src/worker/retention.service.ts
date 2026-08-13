import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { AppConfigService } from '../common/app-config.service.js';
import { PRISMA } from '../common/prisma.service.js';
import {
  BATCH_SIZE,
  MAX_BATCHES_PER_RUN,
  looksStuck,
  retentionPlan,
  type RetentionConfig,
  type RetentionStep,
} from './retention.plan.js';

/**
 * The eight retention jobs — E17-T08. PRD §25.4, TECH-SPEC §7.6.
 *
 * Three properties matter more than throughput:
 *
 *  1. **Batched.** Deleting a year of room messages in one statement holds a
 *     lock long enough to stall the app, and the app is where somebody is
 *     mid-sentence;
 *  2. **Never deletes evidence in an open case.** A moderator ruling on
 *     something they can no longer read, or an appeal with nothing to review,
 *     is a worse outcome than keeping a row past its date (PRD §15.4);
 *  3. **Every run is recorded**, including the ones that deleted nothing — that
 *     record is the only way to tell a quiet job from a broken one.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
  ) {}

  async run(now: Date = new Date()): Promise<{ deleted: number; stuck: string[] }> {
    const config = await this.loadConfig();
    const plan = retentionPlan(config, now);

    let deleted = 0;
    const stuck: string[] = [];

    for (const step of plan) {
      const run = await this.prisma.retentionRun.create({
        data: { jobName: step.job, entity: step.entity, status: 'running' },
      });

      try {
        const removed = await this.execute(step);
        deleted += removed;

        await this.prisma.retentionRun.update({
          where: { id: run.id },
          data: { deletedCount: removed, status: 'completed', finishedAt: new Date() },
        });

        if (await this.isStuck(step.job)) {
          // Not an error — the job ran fine. It is the *pattern* that is wrong,
          // and the whole point of the criterion is that zero is not a
          // reassuring number.
          this.logger.error(
            `retention job ${step.job} has deleted nothing for several runs; check the query`,
          );
          stuck.push(step.job);
        }
      } catch (error) {
        await this.prisma.retentionRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            // The message only; never the rows involved.
            error: error instanceof Error ? error.message : 'unknown',
          },
        });
        // One failing job must not stop the other seven — a broken OTP sweep is
        // not a reason to keep a year of chat past its date.
        this.logger.error(`retention job ${step.job} failed`);
      }
    }

    return { deleted, stuck };
  }

  private async loadConfig(): Promise<RetentionConfig> {
    const keys = [
      'retention.days.post_grace_after_delete',
      'retention.days.room_messages',
      'retention.days.ai_messages',
      'retention.days.safety',
      'retention.days.moderation',
      'retention.days.otp_hours',
      'retention.days.revoked_sessions',
      'retention.days.inactive_devices',
    ] as const;

    const entries = await Promise.all(
      keys.map(async (key) => [key, await this.appConfig.getNumber(key)] as const),
    );

    return Object.fromEntries(entries) as unknown as RetentionConfig;
  }

  private async isStuck(job: string): Promise<boolean> {
    const recent = await this.prisma.retentionRun.findMany({
      where: { jobName: job },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { jobName: true, deletedCount: true, status: true },
    });

    return looksStuck(recent);
  }

  /**
   * Deletes in batches until the table is clean or the run's budget is spent.
   *
   * Raw SQL rather than Prisma's `deleteMany` because the guard is a `NOT
   * EXISTS` against open moderation cases, and expressing that through the
   * client would mean loading candidate ids into memory first — which for a
   * year of messages is the memory problem instead of the lock problem.
   */
  private async execute(step: RetentionStep): Promise<number> {
    let removed = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const affected = await this.deleteBatch(step);
      removed += affected;
      if (affected < BATCH_SIZE) break;
    }

    return removed;
  }

  private async deleteBatch(step: RetentionStep): Promise<number> {
    const { entity, cutoff, respectsOpenCases } = step;

    // The column each table ages on. Kept beside the SQL rather than in the
    // plan: it is a schema detail, not a policy one.
    const column: Record<string, string> = {
      posts: 'deleted_at',
      room_messages: 'created_at',
      ai_messages: 'created_at',
      safety_analyses: 'created_at',
      moderation_cases: 'resolved_at',
      otp_challenges: 'created_at',
      user_sessions: 'revoked_at',
      user_devices: 'last_seen',
    };

    const ageColumn = column[entity];
    if (!ageColumn) throw new Error(`no retention column for ${entity}`);

    const guard = respectsOpenCases
      ? `AND NOT EXISTS (
           SELECT 1 FROM moderation_cases mc
           WHERE mc.status IN ('open', 'in_review', 'escalated')
             AND (mc.target_id::text = t.id::text)
         )`
      : '';

    // `ctid` keeps the batch bounded without an ORDER BY over the whole table.
    const sql = `
      DELETE FROM ${entity} t
      WHERE t.ctid IN (
        SELECT t2.ctid FROM ${entity} t2
        WHERE t2.${ageColumn} IS NOT NULL AND t2.${ageColumn} < $1
        LIMIT ${BATCH_SIZE}
      )
      ${guard}
    `;

    return this.prisma.$executeRawUnsafe(sql, cutoff);
  }
}
