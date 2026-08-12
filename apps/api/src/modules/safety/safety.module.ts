import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LocalRulesService } from './local-rules.service.js';
import { PostSafetyService } from './post-safety.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/**
 * Safety engine — TECH-SPEC §4.1, §4.2 (E07).
 *
 * Holds the local rule engine, the post safety decision and user reports. The
 * AI classifier, full L0–L3 mapping, moderation actions and appeals land in
 * E07 and E08; what is here is the fail-safe branch those will build on.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [LocalRulesService, PostSafetyService, ReportsService],
  exports: [LocalRulesService, PostSafetyService, ReportsService],
})
export class SafetyModule {}
