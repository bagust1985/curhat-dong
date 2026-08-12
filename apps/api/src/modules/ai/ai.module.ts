import { Module, forwardRef } from '@nestjs/common';
import { ProviderRegistry, type ProviderResolver } from '@curhat/ai';
import type { ServerEnv } from '@curhat/config/env/server';

import { ENV } from '../../config/env.config.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { SAFETY_CLASSIFIER } from '../safety/safety-classifier.port.js';
import { AiBudgetService } from './ai-budget.service.js';
import { AiChatService } from './ai-chat.service.js';
import { AiController } from './ai.controller.js';
import { AI_PROVIDER_RESOLVER, AiGatewayService } from './ai-gateway.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { ChatSafetyService } from './chat-safety.service.js';
import { ContextBuilderService } from './context-builder.service.js';
import { ConversationsService } from './conversations.service.js';
import { PromptRegistryService } from './prompt-registry.service.js';
import { GatewaySafetyClassifier } from './safety-classifier.adapter.js';

/**
 * AI Gateway (E08) and DONG AI (E09) — TECH-SPEC §4.3, §4.4, §10.3; PRD §10.
 *
 * Binds `SAFETY_CLASSIFIER`, the port E07 was built against, and owns the
 * conversation surface on top of it.
 *
 * The `forwardRef` to SafetyModule is a real cycle, not an accident of
 * layering: safety needs a classifier from here, and in-chat safety needs the
 * local rules and support resources from there. Splitting either side into a
 * third module would move the cycle without removing it.
 */
@Module({
  imports: [forwardRef(() => SafetyModule), ModerationModule],
  controllers: [AiController],
  providers: [
    {
      // Credentials are read once, here, and never reach a service. Everything
      // downstream sees a `ProviderResolver` and nothing else.
      provide: AI_PROVIDER_RESOLVER,
      inject: [ENV],
      useFactory: (env: ServerEnv): ProviderResolver =>
        new ProviderRegistry({
          primary: env.AI_DEFAULT_PROVIDER,
          fallback: env.AI_FALLBACK_PROVIDER,
          credentials: {
            anthropicApiKey: env.ANTHROPIC_API_KEY,
            anthropicBaseUrl: env.ANTHROPIC_BASE_URL,
            openaiApiKey: env.OPENAI_API_KEY,
            openaiBaseUrl: env.OPENAI_BASE_URL,
            localBaseUrl: env.AI_LOCAL_BASE_URL,
            localApiKey: env.AI_LOCAL_API_KEY,
          },
        }),
    },
    PromptRegistryService,
    AiUsageService,
    AiBudgetService,
    AiQuotaService,
    AiGatewayService,
    GatewaySafetyClassifier,
    { provide: SAFETY_CLASSIFIER, useExisting: GatewaySafetyClassifier },

    ConversationsService,
    ContextBuilderService,
    ChatSafetyService,
    AiChatService,
  ],
  exports: [
    AiGatewayService,
    AiBudgetService,
    AiQuotaService,
    PromptRegistryService,
    ConversationsService,
    SAFETY_CLASSIFIER,
  ],
})
export class AiModule {}
