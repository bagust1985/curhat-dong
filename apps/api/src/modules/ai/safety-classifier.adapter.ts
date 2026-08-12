import { Injectable, Logger } from '@nestjs/common';
import { AiProviderError } from '@curhat/ai';

import {
  ClassifierUnavailableError,
  type ClassificationResult,
  type SafetyClassifier,
} from '../safety/safety-classifier.port.js';
import { AiGatewayService } from './ai-gateway.service.js';

/**
 * Binds the safety engine's classifier port to the real gateway — E08-T09.
 *
 * The whole implementation is one `assessRisk` call, which is the point: risk
 * classification is a first-class request with its own prompt and its own
 * model choice, not something read out of a conversation reply. A model that
 * is busy being warm is not a neutral instrument for measuring danger
 * (TECH-SPEC §4.3).
 *
 * Every failure becomes `ClassifierUnavailableError`, so the fail-safe branch
 * in E07-T05 decides publish-vs-HOLD. Returning empty scores instead would
 * read as "no risk found" and publish (TECH-SPEC §4.2).
 */
@Injectable()
export class GatewaySafetyClassifier implements SafetyClassifier {
  private readonly logger = new Logger(GatewaySafetyClassifier.name);

  constructor(private readonly gateway: AiGatewayService) {}

  async classify(text: string): Promise<ClassificationResult> {
    try {
      const { value, meta } = await this.gateway.assessRisk(text);

      return {
        riskScores: value.riskScores,
        ...(value.emotion ? { emotion: value.emotion } : {}),
        ...(value.topic ? { topic: value.topic } : {}),
        ...(value.intent ? { intent: value.intent } : {}),
        ...(value.urgency ? { urgency: value.urgency } : {}),
        provider: meta.provider,
        model: meta.model,
        promptVersion: meta.promptVersion,
      };
    } catch (error) {
      // Reason logged, content never (non-negotiable #3).
      this.logger.warn(`risk classification unavailable: ${describe(error)}`);
      throw new ClassifierUnavailableError(reasonFor(error));
    }
  }
}

function reasonFor(error: unknown): 'timeout' | 'provider_error' | 'not_configured' {
  if (!(error instanceof AiProviderError)) return 'provider_error';

  switch (error.kind) {
    // An open circuit is treated as a timeout: the provider has been failing
    // long enough that waiting for a fresh one adds nothing — same decision,
    // sooner.
    case 'timeout':
    case 'circuit_open':
      return 'timeout';
    case 'not_configured':
    case 'auth':
      return 'not_configured';
    default:
      return 'provider_error';
  }
}

function describe(error: unknown): string {
  if (error instanceof AiProviderError) return `${error.provider}/${error.kind}`;
  return error instanceof Error ? error.name : 'unknown';
}
