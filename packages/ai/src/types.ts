/**
 * The AI Gateway contract — TECH-SPEC §4.4.
 *
 * Domain code depends on this file and nothing below it. No provider SDK, base
 * URL or API key is visible outside `packages/ai`, which is what makes swapping
 * a provider a configuration change rather than a refactor.
 */

export type AiProviderName = 'anthropic' | 'openai' | 'local';

/** The five operations the gateway exposes. Mirrors TECH-SPEC §4.4. */
export type AiOperation =
  | 'moderate'
  | 'classify_emotion'
  | 'detect_intent'
  | 'assess_risk'
  | 'chat';

export type ModelTier = 'cheap' | 'advanced';

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
}

/** Per-category risk in 0..1. An absent category means "not assessed". */
export interface RiskScores {
  toxicity?: number;
  hate?: number;
  threat?: number;
  harassment?: number;
  sexual?: number;
  self_harm?: number;
  violence?: number;
  scam?: number;
  spam?: number;
  doxxing?: number;
}

export interface ModerationResult {
  flagged: boolean;
  categories: RiskScores;
}

export interface EmotionResult {
  emotion: string;
  confidence: number;
}

export interface IntentResult {
  intent: string;
  confidence: number;
}

export interface RiskResult {
  riskScores: RiskScores;
  /**
   * The model's own signal that it could not decide confidently.
   *
   * Only ever used to escalate to a stronger model — never to lower a level
   * (PRD §10, CLAUDE.md non-negotiable #1).
   */
  ambiguous: boolean;
  emotion?: string;
  topic?: string;
  intent?: string;
  urgency?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  messages: ChatMessage[];
  /** Extra instructions appended after the versioned system prompt. */
  systemSuffix?: string;
  maxTokens?: number;
}

export interface ChatChunk {
  /** Incremental text. Empty string on the terminating chunk. */
  text: string;
  /** Present only on the terminating chunk. */
  usage?: TokenUsage;
  done?: boolean;
}

/** Which prompt produced a result — see `prompts.ts` for why this is required. */
export interface PromptDefinition {
  key: PromptKey;
  version: number;
  template: string;
}

export type PromptKey =
  | 'safety.assess_risk'
  | 'safety.moderate'
  | 'classify.emotion'
  | 'classify.intent'
  | 'chat.system';

export interface AiCallOptions {
  model: string;
  tier: ModelTier;
  prompt: PromptDefinition;
  timeoutMs: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AiCallMeta {
  provider: AiProviderName;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface AiResult<T> {
  value: T;
  meta: AiCallMeta;
}

/**
 * Everything a provider must be able to do.
 *
 * `assessRisk` and `moderate` are separate calls rather than a by-product of
 * `chat` on purpose (TECH-SPEC §4.3): a model that is busy being empathetic is
 * not a neutral instrument for measuring risk.
 */
export interface AIProvider {
  readonly name: AiProviderName;

  moderate(input: string, options: AiCallOptions): Promise<AiResult<ModerationResult>>;
  classifyEmotion(input: string, options: AiCallOptions): Promise<AiResult<EmotionResult>>;
  detectIntent(input: string, options: AiCallOptions): Promise<AiResult<IntentResult>>;
  assessRisk(input: string, options: AiCallOptions): Promise<AiResult<RiskResult>>;
  chat(input: ChatInput, options: AiCallOptions): AsyncIterable<ChatChunk>;
}
