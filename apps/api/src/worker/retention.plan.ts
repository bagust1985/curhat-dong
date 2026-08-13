/**
 * Retention plan — E17-T08. PRD §25.4, TECH-SPEC §7.6.
 *
 * The **what** and **when** of the eight retention jobs, separated from the
 * deletion itself so the arithmetic can be tested without a database. Getting a
 * cutoff wrong deletes data that should have been kept, or keeps data that was
 * promised to be gone — and the promise is in the Privacy Policy.
 *
 * Every value comes from live config (`packages/database/src/config-defaults.ts`),
 * never from a constant here, because PRD §25.4 is a table that can change and
 * a hardcoded 365 would silently disagree with the published policy.
 */

export type RetentionJobName =
  | 'posts'
  | 'room_messages'
  | 'ai_messages'
  | 'safety'
  | 'moderation'
  | 'otp'
  | 'sessions'
  | 'devices';

export interface RetentionStep {
  job: RetentionJobName;
  /**
   * The **physical** table name, not the Prisma model name.
   *
   * `curhat_posts` and `messages` are `@@map`ed away from what the models are
   * called, and a wrong name here fails only against a real database — which is
   * how `retention.db.test.ts` caught it.
   */
  entity: string;
  /** Config key holding the retention period. */
  configKey: string;
  /** Rows older than this are eligible. */
  cutoff: Date;
  /**
   * True when the job must skip rows attached to an open moderation case.
   *
   * Deleting evidence while a case is being decided would leave a moderator
   * ruling on something they can no longer read, and an appeal with nothing to
   * review (PRD §15.4).
   */
  respectsOpenCases: boolean;
}

export interface RetentionConfig {
  'retention.days.post_grace_after_delete': number;
  'retention.days.room_messages': number;
  'retention.days.ai_messages': number;
  'retention.days.safety': number;
  'retention.days.moderation': number;
  'retention.days.otp_hours': number;
  'retention.days.revoked_sessions': number;
  'retention.days.inactive_devices': number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function retentionPlan(config: RetentionConfig, now: Date): RetentionStep[] {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);

  return [
    {
      job: 'posts',
      entity: 'curhat_posts',
      configKey: 'retention.days.post_grace_after_delete',
      // Only soft-deleted posts age out. A live post is kept for as long as its
      // author wants it there — retention is not a cleanup of the feed.
      cutoff: daysAgo(config['retention.days.post_grace_after_delete']),
      respectsOpenCases: true,
    },
    {
      job: 'room_messages',
      entity: 'messages',
      configKey: 'retention.days.room_messages',
      cutoff: daysAgo(config['retention.days.room_messages']),
      respectsOpenCases: true,
    },
    {
      job: 'ai_messages',
      entity: 'ai_messages',
      configKey: 'retention.days.ai_messages',
      cutoff: daysAgo(config['retention.days.ai_messages']),
      respectsOpenCases: true,
    },
    {
      job: 'safety',
      entity: 'safety_events',
      configKey: 'retention.days.safety',
      cutoff: daysAgo(config['retention.days.safety']),
      respectsOpenCases: true,
    },
    {
      job: 'moderation',
      entity: 'moderation_cases',
      configKey: 'retention.days.moderation',
      cutoff: daysAgo(config['retention.days.moderation']),
      // A case cannot be trimmed while it is still open, by definition.
      respectsOpenCases: true,
    },
    {
      job: 'otp',
      entity: 'otp_challenges',
      configKey: 'retention.days.otp_hours',
      // Hours, not days: an OTP that outlives its window is a credential
      // sitting in a table for no reason.
      cutoff: hoursAgo(config['retention.days.otp_hours']),
      respectsOpenCases: false,
    },
    {
      job: 'sessions',
      entity: 'user_sessions',
      configKey: 'retention.days.revoked_sessions',
      cutoff: daysAgo(config['retention.days.revoked_sessions']),
      // Revoked sessions are the audit trail of a reuse detection; they are not
      // evidence in a moderation case.
      respectsOpenCases: false,
    },
    {
      job: 'devices',
      entity: 'user_devices',
      configKey: 'retention.days.inactive_devices',
      cutoff: daysAgo(config['retention.days.inactive_devices']),
      respectsOpenCases: false,
    },
  ];
}

/**
 * How many rows one pass may remove.
 *
 * Batched because a single `DELETE` over a year of room messages takes a lock
 * long enough to stall the app, and the app is where somebody is mid-sentence.
 */
export const BATCH_SIZE = 500;

/** Passes per job per run, so one job cannot monopolise the worker. */
export const MAX_BATCHES_PER_RUN = 40;

/**
 * Consecutive zero-delete runs before this is treated as a broken job.
 *
 * The acceptance criterion, and the counter-intuitive half of it: `deleted_count`
 * staying at zero is **not** reassurance. A job whose query silently stopped
 * matching looks exactly like a job with nothing to do, and the difference is
 * whether data the Privacy Policy promised to delete is still there.
 *
 * Seven days: long enough that a genuinely quiet week does not page anybody,
 * short enough that a broken job is caught well inside the 30-day backup window.
 */
export const ZERO_DELETE_ALERT_THRESHOLD = 7;

export interface RunRecord {
  jobName: string;
  deletedCount: number;
  status: string;
}

/**
 * Decides whether the recent history of a job looks broken.
 *
 * Only counts completed runs: a failed run already alerts on its own, and
 * counting it here would report the same incident twice.
 */
export function looksStuck(
  recentRuns: readonly RunRecord[],
  threshold: number = ZERO_DELETE_ALERT_THRESHOLD,
): boolean {
  const completed = recentRuns.filter((run) => run.status === 'completed');
  if (completed.length < threshold) return false;

  return completed.slice(0, threshold).every((run) => run.deletedCount === 0);
}
