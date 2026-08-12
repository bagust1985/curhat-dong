import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { ContentAnalyzerService } from './content-analyzer.service.js';
import { LocalRulesService } from './local-rules.service.js';
import { ReanalysisService } from './reanalysis.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { SupportResourcesController } from './support-resources.controller.js';
import { SupportResourcesService } from './support-resources.service.js';
import { TrustScoreService } from './trust-score.service.js';

/**
 * Safety engine — PRD §8, §15; TECH-SPEC §4.1, §4.2, BAGIAN 16.
 *
 * The classifier itself is bound in E08 through SAFETY_CLASSIFIER. Until then
 * ContentAnalyzerService falls back to the stand-in, which always reports
 * unavailable so content takes the documented fail-safe path rather than a
 * permissive one.
 */
@Module({
  imports: [AuthModule, ModerationModule],
  controllers: [ReportsController, SupportResourcesController],
  providers: [
    LocalRulesService,
    ContentAnalyzerService,
    SupportResourcesService,
    ReanalysisService,
    ReportsService,
    TrustScoreService,
  ],
  exports: [
    LocalRulesService,
    ContentAnalyzerService,
    SupportResourcesService,
    ReanalysisService,
    ReportsService,
    TrustScoreService,
  ],
})
export class SafetyModule {}
