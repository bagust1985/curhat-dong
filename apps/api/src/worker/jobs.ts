/**
 * The worker's job table — E17-T02 (worker process), E17-T08 (retention).
 *
 * One place listing every recurring job, its schedule and why it runs at that
 * interval. Schedules scattered across call sites are how two jobs end up
 * racing at midnight and nobody can say which one truncated the table.
 *
 * All of these are **repeatable** jobs on a single BullMQ queue. A single queue
 * because none of them is hot: the expensive work in this product happens in
 * the request path, and a worker that needs sharding is a worker with a
 * different problem.
 */

export const WORKER_QUEUE = 'curhat-worker';

export type JobName =
  | 'notifications:deliver-due'
  | 'listener:expire-offers'
  | 'rooms:close-idle'
  | 'analytics:compute-day'
  | 'retention:run';

export interface JobDefinition {
  name: JobName;
  /** Cron in the worker's timezone, which is set to Asia/Jakarta. */
  cron: string;
  /** Why this cadence, in one sentence. */
  rationale: string;
}

export const JOBS: readonly JobDefinition[] = [
  {
    name: 'notifications:deliver-due',
    cron: '* * * * *',
    rationale:
      'Held notifications become due the minute quiet hours end; an hourly sweep would deliver "someone replied" at 08:00 for something that happened at 07:01.',
  },
  {
    name: 'listener:expire-offers',
    cron: '* * * * *',
    rationale:
      'A match offer lives 60 seconds. Expiring it late leaves a requester waiting on somebody who already walked away.',
  },
  {
    name: 'rooms:close-idle',
    cron: '*/5 * * * *',
    rationale:
      'Idle rooms end in session feedback, and the feedback is worth less the longer it arrives after the conversation.',
  },
  {
    name: 'analytics:compute-day',
    // 00:20 rather than 00:00: midnight is when the retention job and every
    // other cron in the world fires, and this one reads tables those write.
    cron: '20 0 * * *',
    rationale:
      'Yesterday is only complete after midnight, and the twenty minutes keep it clear of the midnight pile-up.',
  },
  {
    name: 'retention:run',
    // 03:00 local — after Midnight Mode's peak (21:00–04:00 is the busy window,
    // but 03:00 is its quietest hour) and well before the morning.
    cron: '0 3 * * *',
    rationale:
      'Deletion holds locks; it runs at the quietest hour of the night rather than during the evening peak this product is busiest in.',
  },
];

/**
 * Not scheduled yet: **scheduled broadcasts**.
 *
 * `BroadcastService` can send now and can store a `scheduledAt`, but nothing
 * dispatches one when its time arrives (E14 debt). The job is deliberately
 * absent rather than registered against a method that does not exist — a cron
 * entry pointing at nothing looks like the feature works.
 */

/** The timezone every cron above is interpreted in. */
export const WORKER_TIMEZONE = 'Asia/Jakarta';
