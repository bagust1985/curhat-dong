import { Module } from '@nestjs/common';

import { SAFETY_CLASSIFIER } from '../safety/safety-classifier.port.js';
import { AiBudgetService } from './ai-budget.service.js';
import { AiGatewayService } from './ai-gateway.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { PromptRegistryService } from './prompt-registry.service.js';
import { GatewaySafetyClassifier } from './safety-classifier.adapter.js';

/**
 * AI Gateway — E08. TECH-SPEC §4.4, §10.3; PRD §10.
 *
 * Binds `SAFETY_CLASSIFIER`, the port E07 was built against. From this point
 * the safety engine runs on a real classifier with no change to its own code
 * — which was the reason for defining the port before the provider existed.
 *
 * DONG AI conversations and SSE streaming build on `AiGatewayService` in E09.
 */
@Module({
  providers: [
    PromptRegistryService,
    AiUsageService,
    AiBudgetService,
    AiQuotaService,
    AiGatewayService,
    GatewaySafetyClassifier,
    { provide: SAFETY_CLASSIFIER, useExisting: GatewaySafetyClassifier },
  ],
  exports: [
    AiGatewayService,
    AiBudgetService,
    AiQuotaService,
    PromptRegistryService,
    SAFETY_CLASSIFIER,
  ],
})
export class AiModule {}
