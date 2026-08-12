import type {
  AIProvider,
  AiCallOptions,
  AiProviderName,
  AiResult,
  ChatChunk,
  EmotionResult,
  IntentResult,
  ModerationResult,
  ProviderResolver,
  RiskResult,
  SummaryResult,
} from '@curhat/ai';

/**
 * A provider that answers instantly and never touches the network.
 *
 * Lives beside the code rather than in a test file because more than one test
 * needs it: any test that sends a room message triggers background
 * classification, and a live provider would put an HTTP round trip — and a
 * real API key — inside a test about sockets.
 */
export class ScriptedAiProvider implements AIProvider {
  readonly name: AiProviderName = 'local';

  risk: RiskResult = { riskScores: { toxicity: 0.01 }, ambiguous: false };

  assessRisk(_input: string, options: AiCallOptions): Promise<AiResult<RiskResult>> {
    return this.answer(options, this.risk);
  }

  moderate(_input: string, options: AiCallOptions): Promise<AiResult<ModerationResult>> {
    return this.answer(options, { flagged: false, categories: {} });
  }

  classifyEmotion(_input: string, options: AiCallOptions): Promise<AiResult<EmotionResult>> {
    return this.answer(options, { emotion: 'sedih', confidence: 0.5 });
  }

  detectIntent(_input: string, options: AiCallOptions): Promise<AiResult<IntentResult>> {
    return this.answer(options, { intent: 'mau_cerita', confidence: 0.5 });
  }

  summarize(_input: string, options: AiCallOptions): Promise<AiResult<SummaryResult>> {
    return this.answer(options, { summary: '' });
  }

  // eslint-disable-next-line require-yield
  async *chat(): AsyncIterable<ChatChunk> {
    throw new Error('chat is not part of the room surface');
  }

  private answer<T>(options: AiCallOptions, value: T): Promise<AiResult<T>> {
    return Promise.resolve({
      value,
      meta: {
        provider: this.name,
        model: options.model,
        usage: { tokensIn: 10, tokensOut: 2 },
        latencyMs: 1,
      },
    });
  }
}

export function scriptedResolver(provider = new ScriptedAiProvider()): ProviderResolver {
  return { get: () => provider, order: () => ['local'] };
}
