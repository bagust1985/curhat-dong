import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  AiProviderError,
  CircuitBreaker,
  DEFAULT_RETRY_POLICY,
  ProviderRegistry,
  isAmbiguousRisk,
  isSafetyOperation,
  mergeRoutingConfig,
  modelFor,
  promptVersionLabel,
  resolveTier,
  runWithRetry,
  type AIProvider,
  type AiCallOptions,
  type AiOperation,
  type AiProviderName,
  type AiResult,
  type ChatChunk,
  type ChatInput,
  type EmotionResult,
  type IntentResult,
  type ModelTier,
  type ModerationResult,
  type PromptKey,
  type ProviderResolver,
  type RiskResult,
  type RoutingConfig,
  type TokenUsage,
} from '@curhat/ai';
import type { ServerEnv } from '@curhat/config/env/server';
import { AI_JSON_CONFIG_KEYS } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { ENV } from '../../config/env.config.js';
import { AiBudgetService } from './ai-budget.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { PromptRegistryService } from './prompt-registry.service.js';

export interface GatewayMeta {
  provider: AiProviderName;
  model: string;
  tier: ModelTier;
  promptVersion: string;
  usage: TokenUsage;
  latencyMs: number;
  /** True when the primary provider failed and a backup answered. */
  fallbackUsed: boolean;
  /** True when budget degradation influenced this call's routing. */
  degraded: boolean;
}

export interface GatewayResult<T> {
  value: T;
  meta: GatewayMeta;
}

export interface CallContext {
  userId?: string | undefined;
}

/**
 * Optional override for provider selection.
 *
 * Bound only in tests, so the gateway's own logic — routing, retry, budget,
 * usage logging — can be exercised against a scripted provider instead of a
 * live account.
 */
export const AI_PROVIDER_RESOLVER = Symbol('CURHAT_AI_PROVIDER_RESOLVER');

/**
 * The single door to every AI provider — E08.
 *
 * Responsibilities, in order: pick a prompt version, pick a tier, call a
 * provider with retry and a circuit breaker, fail over to a backup, and record
 * what it cost. Domain code sees none of that.
 *
 * Two rules are enforced here rather than documented:
 *
 *   1. Safety operations never consult the budget guard (PRD §10). The branch
 *      that could degrade them does not exist — `isSafetyOperation` short-
 *      circuits it before `degraded` is even read.
 *   2. `assessRisk` is its own provider call, never a by-product of `chat`
 *      (TECH-SPEC §4.3). Callers start it alongside generation so it costs no
 *      user-visible latency, and a dead conversation model leaves risk
 *      classification working (E08-T09).
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly breakers = new Map<AiProviderName, CircuitBreaker>();
  private registryInstance: ProviderResolver | null = null;

  constructor(
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly appConfig: AppConfigService,
    private readonly prompts: PromptRegistryService,
    private readonly usage: AiUsageService,
    private readonly budget: AiBudgetService,
    private readonly quota: AiQuotaService,
    @Optional() @Inject(AI_PROVIDER_RESOLVER) resolver?: ProviderResolver,
  ) {
    this.registryInstance = resolver ?? null;
  }

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  /**
   * Risk classification, escalating to the advanced model when the answer is
   * too close to call.
   *
   * The escalation is one-directional on purpose: ambiguity buys a better
   * model, never a cheaper one.
   */
  async assessRisk(text: string, context: CallContext = {}): Promise<GatewayResult<RiskResult>> {
    const routing = await this.routing();

    const first = await this.execute({
      operation: 'assess_risk',
      promptKey: 'safety.assess_risk',
      context,
      routing,
      invoke: (provider, options) => provider.assessRisk(text, options),
    });

    if (first.meta.tier === 'advanced') return first;

    const ambiguous =
      first.value.ambiguous || isAmbiguousRisk(first.value.riskScores, routing.ambiguityBand);
    if (!ambiguous) return first;

    try {
      return await this.execute({
        operation: 'assess_risk',
        promptKey: 'safety.assess_risk',
        context,
        routing,
        ambiguous: true,
        invoke: (provider, options) => provider.assessRisk(text, options),
      });
    } catch (error) {
      // The cheap verdict is a real classification, just an uncertain one.
      // Discarding it because the escalation failed would trade a usable
      // signal for the fail-safe path, which is a worse answer, not a safer one.
      this.logger.warn('advanced escalation failed; keeping the cheap-tier verdict', error);
      return first;
    }
  }

  async moderate(
    text: string,
    context: CallContext = {},
  ): Promise<GatewayResult<ModerationResult>> {
    return this.execute({
      operation: 'moderate',
      promptKey: 'safety.moderate',
      context,
      invoke: (provider, options) => provider.moderate(text, options),
    });
  }

  async classifyEmotion(
    text: string,
    context: CallContext = {},
  ): Promise<GatewayResult<EmotionResult>> {
    return this.execute({
      operation: 'classify_emotion',
      promptKey: 'classify.emotion',
      context,
      invoke: (provider, options) => provider.classifyEmotion(text, options),
    });
  }

  async detectIntent(
    text: string,
    context: CallContext = {},
  ): Promise<GatewayResult<IntentResult>> {
    return this.execute({
      operation: 'detect_intent',
      promptKey: 'classify.intent',
      context,
      invoke: (provider, options) => provider.detectIntent(text, options),
    });
  }

  /**
   * Streams a DONG AI reply.
   *
   * Quota and budget are checked here and only here: when the money runs out,
   * this is what stops (PRD §10). Failover only happens before the first token
   * reaches the user — re-answering a half-delivered reply would read as the
   * AI contradicting itself mid-sentence.
   */
  async *chat(input: ChatInput, context: { userId: string }): AsyncIterable<ChatChunk> {
    await this.budget.assertChatAllowed();
    await this.quota.consume(context.userId);

    const routing = await this.routing();
    const degraded = await this.budget.isDegraded();
    const decision = resolveTier({ operation: 'chat', degraded }, routing);
    const prompt = await this.prompts.active('chat.system');
    const promptVersion = promptVersionLabel(prompt);
    const timeoutMs = await this.appConfig.getNumber('ai.chat_timeout_ms');

    const providers = this.registry().order();
    let emitted = false;
    let lastError: unknown;

    for (const [index, name] of providers.entries()) {
      const model = modelFor(name, decision.tier, routing);
      const usage: TokenUsage = { tokensIn: 0, tokensOut: 0 };
      const startedAt = Date.now();

      try {
        const provider = this.registry().get(name);
        const options: AiCallOptions = {
          model,
          tier: decision.tier,
          prompt,
          timeoutMs,
        };

        for await (const chunk of provider.chat(input, options)) {
          if (chunk.text) emitted = true;
          if (chunk.usage) Object.assign(usage, chunk.usage);
          yield chunk;
        }

        const cost = await this.usage.record({
          userId: context.userId,
          operation: 'chat',
          provider: name,
          model,
          tier: decision.tier,
          usage,
          latencyMs: Date.now() - startedAt,
          status: 'ok',
          fallbackUsed: index > 0,
          degraded: decision.reason === 'budget_degraded',
          promptVersion,
        });
        await this.budget.addSpend(cost);
        return;
      } catch (error) {
        lastError = error;
        await this.usage.record({
          userId: context.userId,
          operation: 'chat',
          provider: name,
          model,
          tier: decision.tier,
          usage,
          latencyMs: Date.now() - startedAt,
          status: statusFor(error),
          fallbackUsed: index > 0,
          degraded: decision.reason === 'budget_degraded',
          promptVersion,
        });

        if (emitted) break;
      }
    }

    if (!emitted) {
      // Nothing was delivered, so the message was never really sent.
      await this.quota.refund(context.userId);
    }

    this.logger.error('chat failed on every configured provider', lastError);
    throw ApiException.unavailable(
      'AI_PROVIDER_UNAVAILABLE',
      'DONG AI lagi tidak bisa dihubungi. Coba lagi sebentar lagi ya.',
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async execute<T>(params: {
    operation: AiOperation;
    promptKey: PromptKey;
    context: CallContext;
    routing?: RoutingConfig;
    ambiguous?: boolean;
    invoke: (provider: AIProvider, options: AiCallOptions) => Promise<AiResult<T>>;
  }): Promise<GatewayResult<T>> {
    const routing = params.routing ?? (await this.routing());
    const prompt = await this.prompts.active(params.promptKey);
    const promptVersion = promptVersionLabel(prompt);

    // Safety operations never ask whether the budget is tight. This ordering
    // is the enforcement point for CLAUDE.md non-negotiable #1.
    const degraded = isSafetyOperation(params.operation) ? false : await this.budget.isDegraded();

    const decision = resolveTier(
      {
        operation: params.operation,
        ...(params.ambiguous === undefined ? {} : { ambiguous: params.ambiguous }),
        degraded,
      },
      routing,
    );

    const [timeoutMs, maxAttempts] = await Promise.all([
      this.appConfig.getNumber('ai.timeout_ms'),
      this.appConfig.getNumber('ai.max_attempts'),
    ]);

    const providers = this.registry().order();
    let lastError: unknown;

    for (const [index, name] of providers.entries()) {
      const model = modelFor(name, decision.tier, routing);
      const startedAt = Date.now();

      try {
        const provider = this.registry().get(name);
        const options: AiCallOptions = { model, tier: decision.tier, prompt, timeoutMs };

        const result = await runWithRetry(() => params.invoke(provider, options), {
          policy: { ...DEFAULT_RETRY_POLICY, maxAttempts },
          breaker: await this.breakerFor(name),
        });

        const cost = await this.usage.record({
          userId: params.context.userId,
          operation: params.operation,
          provider: name,
          model,
          tier: decision.tier,
          usage: result.meta.usage,
          latencyMs: result.meta.latencyMs,
          status: 'ok',
          fallbackUsed: index > 0,
          degraded: decision.reason === 'budget_degraded',
          promptVersion,
        });
        await this.budget.addSpend(cost);

        return {
          value: result.value,
          meta: {
            provider: result.meta.provider,
            model: result.meta.model,
            tier: decision.tier,
            promptVersion,
            usage: result.meta.usage,
            latencyMs: result.meta.latencyMs,
            fallbackUsed: index > 0,
            degraded: decision.reason === 'budget_degraded',
          },
        };
      } catch (error) {
        lastError = error;

        // Failed calls are recorded too. A provider that times out all day
        // costs nothing and would otherwise leave no trace in the metrics.
        await this.usage.record({
          userId: params.context.userId,
          operation: params.operation,
          provider: name,
          model,
          tier: decision.tier,
          usage: { tokensIn: 0, tokensOut: 0 },
          latencyMs: Date.now() - startedAt,
          status: statusFor(error),
          fallbackUsed: index > 0,
          degraded: decision.reason === 'budget_degraded',
          promptVersion,
        });
      }
    }

    throw lastError instanceof AiProviderError
      ? lastError
      : new AiProviderError('server_error', 'gateway', 'All AI providers failed', {
          cause: lastError,
        });
  }

  private registry(): ProviderResolver {
    if (this.registryInstance) return this.registryInstance;

    this.registryInstance = new ProviderRegistry({
      primary: this.env.AI_DEFAULT_PROVIDER,
      fallback: this.env.AI_FALLBACK_PROVIDER,
      credentials: {
        anthropicApiKey: this.env.ANTHROPIC_API_KEY,
        anthropicBaseUrl: this.env.ANTHROPIC_BASE_URL,
        openaiApiKey: this.env.OPENAI_API_KEY,
        openaiBaseUrl: this.env.OPENAI_BASE_URL,
        localBaseUrl: this.env.AI_LOCAL_BASE_URL,
        localApiKey: this.env.AI_LOCAL_API_KEY,
      },
    });

    return this.registryInstance;
  }

  private async breakerFor(name: AiProviderName): Promise<CircuitBreaker> {
    const existing = this.breakers.get(name);
    if (existing) return existing;

    const [failureThreshold, cooldownSeconds] = await Promise.all([
      this.appConfig.getNumber('ai.circuit_breaker_threshold'),
      this.appConfig.getNumber('ai.circuit_breaker_cooldown_seconds'),
    ]);

    const breaker = new CircuitBreaker({
      failureThreshold,
      cooldownMs: cooldownSeconds * 1_000,
    });
    this.breakers.set(name, breaker);
    return breaker;
  }

  private async routing(): Promise<RoutingConfig> {
    return mergeRoutingConfig(await this.appConfig.getJson(AI_JSON_CONFIG_KEYS.routing, null));
  }

  /** Test and ops seam — closes every circuit. */
  resetBreakers(): void {
    for (const breaker of this.breakers.values()) breaker.reset();
  }
}

function statusFor(error: unknown): string {
  return error instanceof AiProviderError ? error.kind : 'error';
}
