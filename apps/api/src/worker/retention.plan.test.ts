import { describe, expect, it } from 'vitest';

import {
  BATCH_SIZE,
  MAX_BATCHES_PER_RUN,
  ZERO_DELETE_ALERT_THRESHOLD,
  looksStuck,
  retentionPlan,
  type RetentionConfig,
} from './retention.plan';

/**
 * Retention arithmetic — E17-T08. PRD §25.4.
 *
 * Tested away from the database because the risk here is not a broken query; it
 * is a cutoff that disagrees with the Privacy Policy. Deleting a year early is
 * data loss, deleting a year late is a promise broken.
 */

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

const NOW = new Date('2026-08-13T12:00:00.000Z');

describe('the plan', () => {
  const plan = retentionPlan(CONFIG, NOW);

  it('covers all eight jobs the task lists', () => {
    expect(plan.map((step) => step.job)).toEqual([
      'posts',
      'room_messages',
      'ai_messages',
      'safety',
      'moderation',
      'otp',
      'sessions',
      'devices',
    ]);
  });

  it('computes each cutoff from config, matching PRD §25.4', () => {
    const cutoffOf = (job: string) => plan.find((step) => step.job === job)?.cutoff.toISOString();

    // 365 days before 13 Aug 2026 is 13 Aug 2025.
    expect(cutoffOf('room_messages')).toBe('2025-08-13T12:00:00.000Z');
    // 180 days.
    expect(cutoffOf('ai_messages')).toBe('2026-02-14T12:00:00.000Z');
    // 730 days.
    expect(cutoffOf('safety')).toBe('2024-08-13T12:00:00.000Z');
  });

  it('measures OTP in hours, not days', () => {
    // A day's worth of OTPs is 24 hours of credentials, not 24 days.
    expect(retentionPlan(CONFIG, NOW).find((step) => step.job === 'otp')?.cutoff.toISOString()).toBe(
      '2026-08-12T12:00:00.000Z',
    );
  });

  it('follows config rather than a constant', () => {
    const shorter = retentionPlan({ ...CONFIG, 'retention.days.room_messages': 30 }, NOW);
    expect(shorter.find((step) => step.job === 'room_messages')?.cutoff.toISOString()).toBe(
      '2026-07-14T12:00:00.000Z',
    );
  });

  it('protects anything that could be evidence in an open case', () => {
    for (const job of ['posts', 'room_messages', 'ai_messages', 'safety', 'moderation']) {
      expect(plan.find((step) => step.job === job)?.respectsOpenCases, job).toBe(true);
    }
    // OTPs, revoked sessions and dead devices are never evidence.
    for (const job of ['otp', 'sessions', 'devices']) {
      expect(plan.find((step) => step.job === job)?.respectsOpenCases, job).toBe(false);
    }
  });

  it('names the config key it used, so a run can be traced to a setting', () => {
    for (const step of plan) {
      expect(CONFIG).toHaveProperty(step.configKey);
    }
  });

  it('batches rather than deleting a year in one statement', () => {
    // A single DELETE over a year of room messages holds a lock long enough to
    // stall the app, and the app is where somebody is mid-sentence.
    expect(BATCH_SIZE).toBeLessThanOrEqual(1000);
    expect(MAX_BATCHES_PER_RUN * BATCH_SIZE).toBeGreaterThan(10_000);
  });
});

describe('a job that stopped working', () => {
  const zero = (count: number) =>
    Array.from({ length: count }, () => ({
      jobName: 'room_messages',
      deletedCount: 0,
      status: 'completed',
    }));

  it('treats a long run of zero deletions as a fault, not as safety', () => {
    // The counter-intuitive half of the criterion: a query that silently stopped
    // matching looks exactly like a job with nothing to do.
    expect(looksStuck(zero(ZERO_DELETE_ALERT_THRESHOLD))).toBe(true);
  });

  it('stays quiet during a genuinely quiet week', () => {
    expect(looksStuck(zero(ZERO_DELETE_ALERT_THRESHOLD - 1))).toBe(false);
  });

  it('resets as soon as one run deletes something', () => {
    const runs = [
      { jobName: 'room_messages', deletedCount: 12, status: 'completed' },
      ...zero(ZERO_DELETE_ALERT_THRESHOLD),
    ];
    expect(looksStuck(runs)).toBe(false);
  });

  it('does not double-report a job that is already failing loudly', () => {
    const failing = Array.from({ length: ZERO_DELETE_ALERT_THRESHOLD }, () => ({
      jobName: 'room_messages',
      deletedCount: 0,
      status: 'failed',
    }));
    // A failed run alerts on its own; counting it here reports one incident twice.
    expect(looksStuck(failing)).toBe(false);
  });
});
