import { Module } from '@nestjs/common';

import { RetentionService } from './retention.service.js';

/**
 * Providers the worker process needs that the HTTP app does not — E17-T08.
 *
 * Imported by `AppModule` so a single application context serves both
 * entrypoints. `RetentionService` has no controller and is unreachable over
 * HTTP: deletion runs on a schedule, never because somebody called an endpoint.
 */
@Module({
  providers: [RetentionService],
  exports: [RetentionService],
})
export class WorkerModule {}
