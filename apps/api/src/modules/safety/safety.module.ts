import { Module, forwardRef } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { ContentAnalyzerService } from './content-analyzer.service.js';
import { LocalRulesService } from './local-rules.service.js';
import { SafetyThresholdsService } from './safety-thresholds.service.js';
import { ReanalysisService } from './reanalysis.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { SupportResourcesController } from './support-resources.controller.js';
import { SupportResourcesService } from './support-resources.service.js';
import { TrustScoreService } from './trust-score.service.js';

/**
 * Safety engine — PRD §8, §15; TECH-SPEC §4.1, §4.2, BAGIAN 16.
 *
 * The classifier arrives through SAFETY_CLASSIFIER, bound by AiModule (E08).
 * ContentAnalyzerService still treats that provider as optional and falls back
 * to the stand-in when it is absent, so a misconfigured deployment takes the
 * documented fail-safe path rather than a permissive one.
 */
@Module({
  imports: [AuthModule, ModerationModule, forwardRef(() => AiModule)],
  controllers: [ReportsController, SupportResourcesController],
  providers: [
    SafetyThresholdsService,
    LocalRulesService,
    ContentAnalyzerService,
    SupportResourcesService,
    ReanalysisService,
    ReportsService,
    TrustScoreService,
  ],
  exports: [
    SafetyThresholdsService,
    LocalRulesService,
    ContentAnalyzerService,
    SupportResourcesService,
    ReanalysisService,
    ReportsService,
    TrustScoreService,
  ],
})
export class SafetyModule {}
