import type { AiOperation, AiProviderName, ModelTier, RiskScores } from './types.js';

/**
 * Cheap vs advanced model routing — E08-T03, TECH-SPEC §4.4, PRD §10.
 *
 * Pure functions with no I/O. The routing table is data so it can be changed
 * from `app_configs` without a deploy; the *rules* below are code because one
 * of them is a non-negotiable: ambiguous safety input goes up to the advanced
 * model and is never sent down to save money.
 */

export interface RoutingConfig {
  /** Model id per provider per tier. */
  models: Record<AiProviderName, Record<ModelTier, string>>;
  /** Operations that use the advanced tier by default. */
  advancedOperations: AiOperation[];
  /**
   * A risk score inside this band is neither clearly safe nor clearly unsafe.
   * Anything in it makes the call ambiguous, which forces the advanced model.
   */
  ambiguityBand: { low: number; high: number };
}

export const DEFAULT_ROUTING: RoutingConfig = {
  models: {
    anthropic: { cheap: 'claude-haiku-4-5', advanced: 'claude-sonnet-5' },
    // Verify against the provider's current model list and price page before
    // switching production traffic here; these are defaults, not commitments.
    openai: { cheap: 'gpt-4o-mini', advanced: 'gpt-4o' },
    local: { cheap: 'local-cheap', advanced: 'local-advanced' },
  },
  // Conversation is advanced by default (TECH-SPEC §4.4: "complex DONG AI
  // conversation"). Safety starts cheap and escalates on ambiguity, which
  // costs less than running every post through the expensive model while
  // keeping the hard cases on it.
  advancedOperations: ['chat'],
  ambiguityBand: { low: 0.3, high: 0.75 },
};

/** Operations whose output feeds the safety engine. */
const SAFETY_OPERATIONS: ReadonlySet<AiOperation> = new Set<AiOperation>([
  'assess_risk',
  'moderate',
]);

export function isSafetyOperation(operation: AiOperation): boolean {
  return SAFETY_OPERATIONS.has(operation);
}

export interface RouteInput {
  operation: AiOperation;
  /** The classifier could not decide, or scores landed in the ambiguity band. */
  ambiguous?: boolean;
  /** Daily budget is at or past the degradation threshold (E08-T06). */
  degraded?: boolean;
}

export type RouteReason =
  | 'safety_escalation'
  | 'operation_default'
  | 'budget_degraded'
  | 'base';

export interface RouteDecision {
  tier: ModelTier;
  reason: RouteReason;
}

/**
 * Picks a tier.
 *
 * Safety operations are resolved first and never consult `degraded`. That
 * ordering is the enforcement point for PRD §10: cost pressure must not be
 * able to reach the code path that classifies risk.
 */
export function resolveTier(input: RouteInput, config: RoutingConfig): RouteDecision {
  if (isSafetyOperation(input.operation)) {
    if (input.ambiguous) return { tier: 'advanced', reason: 'safety_escalation' };
    return {
      tier: config.advancedOperations.includes(input.operation) ? 'advanced' : 'cheap',
      reason: 'operation_default',
    };
  }

  if (input.degraded) return { tier: 'cheap', reason: 'budget_degraded' };

  if (config.advancedOperations.includes(input.operation)) {
    return { tier: 'advanced', reason: 'operation_default' };
  }

  return { tier: 'cheap', reason: 'base' };
}

export function modelFor(
  provider: AiProviderName,
  tier: ModelTier,
  config: RoutingConfig,
): string {
  return config.models[provider][tier];
}

/**
 * Whether a set of scores is too close to call.
 *
 * A verdict of 0.5 on self-harm is not "half safe" — it is the classifier
 * saying it does not know, on the one category where being wrong is worst.
 */
export function isAmbiguousRisk(
  scores: RiskScores,
  band: RoutingConfig['ambiguityBand'],
): boolean {
  return Object.values(scores).some(
    (score) => typeof score === 'number' && score >= band.low && score <= band.high,
  );
}

/** Merges a partial override from `app_configs` onto the defaults. */
export function mergeRoutingConfig(override: unknown): RoutingConfig {
  if (!override || typeof override !== 'object') return DEFAULT_ROUTING;
  const partial = override as Partial<RoutingConfig>;

  return {
    models: {
      anthropic: { ...DEFAULT_ROUTING.models.anthropic, ...partial.models?.anthropic },
      openai: { ...DEFAULT_ROUTING.models.openai, ...partial.models?.openai },
      local: { ...DEFAULT_ROUTING.models.local, ...partial.models?.local },
    },
    advancedOperations: partial.advancedOperations ?? DEFAULT_ROUTING.advancedOperations,
    ambiguityBand: { ...DEFAULT_ROUTING.ambiguityBand, ...partial.ambiguityBand },
  };
}
