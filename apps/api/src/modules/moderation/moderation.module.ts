import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AppealsController } from './appeals.controller.js';
import { AppealsService } from './appeals.service.js';
import { ModerationService } from './moderation.service.js';
import { SlaWatchdogService } from './sla-watchdog.service.js';

/**
 * Moderation cases, actions, appeals and the SLA watchdog (E07-T08 to T12).
 *
 * Admin-facing queue and review screens land in E14; this module owns the
 * rules those screens operate on.
 */
@Module({
  imports: [AuthModule],
  controllers: [AppealsController],
  providers: [ModerationService, AppealsService, SlaWatchdogService],
  exports: [ModerationService, AppealsService, SlaWatchdogService],
})
export class ModerationModule {}
