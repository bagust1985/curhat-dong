import { Module } from '@nestjs/common';

import { LocalRulesService } from './local-rules.service.js';
import { PostSafetyService } from './post-safety.service.js';

/**
 * Safety engine — TECH-SPEC §4.1, §4.2 (E07).
 *
 * Currently holds the local rule engine and the post safety decision. The AI
 * classifier, full L0–L3 mapping, moderation actions and appeals land in E07
 * and E08; what exists here is the fail-safe branch those will build on.
 */
@Module({
  providers: [LocalRulesService, PostSafetyService],
  exports: [LocalRulesService, PostSafetyService],
})
export class SafetyModule {}
