import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

import { initSentry } from '../observability/sentry.js';
import { AppModule } from '../app.module.js';
import { AnalyticsService } from '../modules/admin/analytics.service.js';
import { RoomsService } from '../modules/chat/rooms.service.js';
import { OffersService } from '../modules/listener/offers.service.js';
import { NotificationFanoutService } from '../modules/notifications/notification-fanout.service.js';
import { RetentionService } from './retention.service.js';
import { JOBS, WORKER_QUEUE, WORKER_TIMEZONE, type JobName } from './jobs.js';

/**
 * The worker process — E17-T02.
 *
 * ## Why this is an entrypoint and not a separate package
 *
 * CLAUDE.md asks for a worker separate from the API. Separate **process**, and
 * it is: its own container, its own command, its own restart policy. What it is
 * not is a separate codebase — every job here calls a service the API already
 * owns (`deliverDue`, `expireOverdue`, `closeIdleRooms`, `computeDay`), and
 * those services carry the rules about held notifications, expired offers and
 * idle rooms.
 *
 * A standalone `apps/worker` would have to either import across app boundaries
 * or reimplement them, and a second implementation of "when may a notification
 * be delivered" is exactly the kind of drift that ends with quiet hours being
 * respected on one path and not the other.
 *
 * So: one image, two commands (`start` and `start:worker`), one set of rules.
 */

initSentry('worker');

async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');

  // `createApplicationContext` rather than `create`: no HTTP server, no port,
  // nothing listening. A worker that opens a port is a worker somebody will
  // eventually route traffic to.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const connection = new IORedis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379', {
    // BullMQ requires this; without it a blocking command retries forever and
    // the worker looks alive while doing nothing.
    maxRetriesPerRequest: null,
  });

  const handlers: Record<JobName, () => Promise<unknown>> = {
    'notifications:deliver-due': () => app.get(NotificationFanoutService).deliverDue(),
    'listener:expire-offers': () => app.get(OffersService).expireOverdue(),
    'rooms:close-idle': () => app.get(RoomsService).closeIdleRooms(),
    'analytics:compute-day': () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return app.get(AnalyticsService).computeDay(yesterday);
    },
    'retention:run': () => app.get(RetentionService).run(),
  };

  const queue = new Queue(WORKER_QUEUE, { connection });

  // Repeatable jobs are keyed by name, so re-registering on every boot updates
  // a changed schedule instead of stacking a second copy of the job.
  for (const job of JOBS) {
    await queue.upsertJobScheduler(
      job.name,
      { pattern: job.cron, tz: WORKER_TIMEZONE },
      { name: job.name },
    );
  }

  const worker = new Worker(
    WORKER_QUEUE,
    async (job: Job) => {
      const handler = handlers[job.name as JobName];
      if (!handler) {
        logger.warn(`job tanpa handler: ${job.name}`);
        return;
      }

      const started = Date.now();
      const result = await handler();
      // Names, counts and durations only. What these jobs move is somebody's
      // curhat, and a log line is the easiest place for it to escape.
      logger.log(`${job.name} selesai dalam ${Date.now() - started}ms`);
      return result;
    },
    {
      connection,
      // One at a time. These jobs write to the same tables, and the failure mode
      // of running them together is a deadlock at 03:00 that nobody sees.
      concurrency: 1,
    },
  );

  worker.on('failed', (job, error) => {
    // The message, never the payload.
    logger.error(`${job?.name ?? 'job'} gagal: ${error.message}`);
  });

  const shutdown = async (signal: string) => {
    logger.log(`${signal} diterima, menutup worker`);
    // Closes after the running job finishes: killing a retention batch halfway
    // leaves a `retention_runs` row stuck in `running` forever.
    await worker.close();
    await queue.close();
    await connection.quit();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.log(`worker siap — ${JOBS.length} job terjadwal (${WORKER_TIMEZONE})`);
}

void bootstrap();
