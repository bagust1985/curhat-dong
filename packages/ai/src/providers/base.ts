import { z } from 'zod';

import { AiProviderError } from '../errors.js';
import type {
  AIProvider,
  AiCallMeta,
  AiCallOptions,
  AiProviderName,
  AiResult,
  ChatChunk,
  ChatInput,
  ChatMessage,
  EmotionResult,
  IntentResult,
  ModerationResult,
  RiskResult,
  RiskScores,
  SummaryResult,
  TokenUsage,
} from '../types.js';

/**
 * Everything the five gateway operations need from a transport.
 *
 * Adapters implement these two methods; the operations themselves live once,
 * in this class, so the same prompt, parsing and error handling apply to every
 * provider. That is what makes the contract test in `providers.contract.test.ts`
 * meaningful — it runs against all of them unchanged.
 */
export interface CompletionRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
}

export interface CompletionResponse {
  text: string;
  usage: TokenUsage;
}

const RISK_CATEGORIES = [
  'toxicity',
  'hate',
  'threat',
  'harassment',
  'sexual',
  'self_harm',
  'violence',
  'scam',
  'spam',
  'doxxing',
] as const;

const scoreRecordSchema = z.record(z.string(), z.number());

const assessRiskSchema = z.object({
  riskScores: scoreRecordSchema.optional(),
  ambiguous: z.boolean().optional(),
  emotion: z.string().optional(),
  topic: z.string().optional(),
  intent: z.string().optional(),
  urgency: z.string().optional(),
});

const moderateSchema = z.object({
  flagged: z.boolean().optional(),
  categories: scoreRecordSchema.optional(),
});

const emotionSchema = z.object({
  emotion: z.string(),
  confidence: z.number().optional(),
});

const intentSchema = z.object({
  intent: z.string(),
  confidence: z.number().optional(),
});

const summarySchema = z.object({
  summary: z.string(),
});

/**
 * Output ceiling for classification.
 *
 * The JSON itself is tiny; the headroom is for models that reason before
 * answering. No adapter sends a provider-specific "disable thinking" flag —
 * that field exists on some models and 400s on others, and the gateway must
 * stay model-agnostic. Paying for a little unused budget is the cheaper
 * mistake than a verdict truncated mid-JSON.
 */
const CLASSIFICATION_MAX_TOKENS = 2_048;
const CHAT_MAX_TOKENS = 1_024;

export abstract class BaseAiProvider implements AIProvider {
  abstract readonly name: AiProviderName;

  protected abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  protected abstract streamChat(request: CompletionRequest): AsyncIterable<ChatChunk>;

  async assessRisk(input: string, options: AiCallOptions): Promise<AiResult<RiskResult>> {
    const { response, latencyMs } = await this.runClassification(input, options);
    const parsed = this.parseJson(response.text, assessRiskSchema);

    const value: RiskResult = {
      riskScores: normaliseScores(parsed.riskScores),
      ambiguous: parsed.ambiguous ?? false,
      ...(parsed.emotion ? { emotion: parsed.emotion } : {}),
      ...(parsed.topic ? { topic: parsed.topic } : {}),
      ...(parsed.intent ? { intent: parsed.intent } : {}),
      ...(parsed.urgency ? { urgency: parsed.urgency } : {}),
    };

    return { value, meta: this.meta(options, response, latencyMs) };
  }

  async moderate(input: string, options: AiCallOptions): Promise<AiResult<ModerationResult>> {
    const { response, latencyMs } = await this.runClassification(input, options);
    const parsed = this.parseJson(response.text, moderateSchema);

    return {
      value: {
        flagged: parsed.flagged ?? false,
        categories: normaliseScores(parsed.categories),
      },
      meta: this.meta(options, response, latencyMs),
    };
  }

  async classifyEmotion(
    input: string,
    options: AiCallOptions,
  ): Promise<AiResult<EmotionResult>> {
    const { response, latencyMs } = await this.runClassification(input, options);
    const parsed = this.parseJson(response.text, emotionSchema);

    return {
      value: { emotion: parsed.emotion, confidence: clamp(parsed.confidence ?? 0) },
      meta: this.meta(options, response, latencyMs),
    };
  }

  async detectIntent(input: string, options: AiCallOptions): Promise<AiResult<IntentResult>> {
    const { response, latencyMs } = await this.runClassification(input, options);
    const parsed = this.parseJson(response.text, intentSchema);

    return {
      value: { intent: parsed.intent, confidence: clamp(parsed.confidence ?? 0) },
      meta: this.meta(options, response, latencyMs),
    };
  }

  async summarize(input: string, options: AiCallOptions): Promise<AiResult<SummaryResult>> {
    const { response, latencyMs } = await this.runClassification(input, options);
    const parsed = this.parseJson(response.text, summarySchema);

    return {
      value: { summary: parsed.summary },
      meta: this.meta(options, response, latencyMs),
    };
  }

  chat(input: ChatInput, options: AiCallOptions): AsyncIterable<ChatChunk> {
    const system = input.systemSuffix
      ? `${options.prompt.template}\n\n${input.systemSuffix}`
      : options.prompt.template;

    return this.streamChat({
      model: options.model,
      system,
      messages: input.messages,
      maxTokens: input.maxTokens ?? options.maxTokens ?? CHAT_MAX_TOKENS,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
  }

  private async runClassification(
    input: string,
    options: AiCallOptions,
  ): Promise<{ response: CompletionResponse; latencyMs: number }> {
    const startedAt = Date.now();

    const response = await this.complete({
      model: options.model,
      system: options.prompt.template,
      messages: [{ role: 'user', content: input }],
      maxTokens: options.maxTokens ?? CLASSIFICATION_MAX_TOKENS,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    return { response, latencyMs: Date.now() - startedAt };
  }

  private meta(
    options: AiCallOptions,
    response: CompletionResponse,
    latencyMs: number,
  ): AiCallMeta {
    return {
      provider: this.name,
      model: options.model,
      usage: response.usage,
      latencyMs,
    };
  }

  /**
   * Parses the model's answer.
   *
   * Unparseable output is an error, never an empty result: a caller that
   * received `{}` would read "no risk found" and publish. The whole fail-safe
   * design (TECH-SPEC §4.2) rests on this distinction.
   */
  protected parseJson<T>(text: string, schema: z.ZodType<T>): T {
    const json = extractJsonObject(text);
    if (!json) {
      throw new AiProviderError(
        'invalid_response',
        this.name,
        'Model did not return a JSON object',
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (cause) {
      throw new AiProviderError('invalid_response', this.name, 'Model returned invalid JSON', {
        cause,
      });
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      // The failure reason is logged, the content never (non-negotiable #3).
      throw new AiProviderError(
        'invalid_response',
        this.name,
        `Model response failed schema validation: ${result.error.issues
          .map((issue) => issue.path.join('.') || '(root)')
          .join(', ')}`,
      );
    }

    return result.data;
  }
}

/** Pulls the first balanced JSON object out of a response, fences and all. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Keeps known categories, drops invented ones, clamps to 0..1.
 *
 * A model that answers `self_harm: 3` must not be able to push a score past
 * every threshold at once.
 */
function normaliseScores(scores: Record<string, number> | undefined): RiskScores {
  if (!scores) return {};
  const result: Record<string, number> = {};

  for (const category of RISK_CATEGORIES) {
    const value = scores[category];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[category] = clamp(value);
    }
  }

  return result as RiskScores;
}
