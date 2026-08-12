import type { TokenUsage } from './types.js';

/**
 * Cost estimation — E08-T05, PRD §10.
 *
 * Prices are USD per million tokens and live in data, not in the call sites,
 * because they change without asking us. The table is overridable from
 * `app_configs` so a price change is a config edit rather than a release.
 */

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * Defaults as published at the time of writing.
 *
 * Anthropic rows are first-party list prices. The OpenAI rows are starting
 * points that must be checked against the provider's current price page before
 * that provider carries production traffic — an estimate nobody verified is
 * worse than no estimate, because it looks authoritative.
 */
export const DEFAULT_MODEL_PRICING: Readonly<Record<string, ModelPrice>> = Object.freeze({
  'claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'claude-sonnet-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-opus-5': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  'gpt-4o': { inputPerMTok: 2.5, outputPerMTok: 10.0 },
  // Self-hosted: the marginal cost per token is not zero in reality, but it is
  // not per-token either. Left at zero so the budget guard measures provider
  // spend, which is the thing that can actually run away.
  'local-cheap': { inputPerMTok: 0, outputPerMTok: 0 },
  'local-advanced': { inputPerMTok: 0, outputPerMTok: 0 },
});

export interface CostEstimate {
  /** USD. */
  cost: number;
  /** False when the model has no price row — the caller should say so loudly. */
  priced: boolean;
}

export function estimateCost(
  model: string,
  usage: TokenUsage,
  table: Readonly<Record<string, ModelPrice>> = DEFAULT_MODEL_PRICING,
): CostEstimate {
  const price = table[model];
  if (!price) return { cost: 0, priced: false };

  const cost =
    (usage.tokensIn / 1_000_000) * price.inputPerMTok +
    (usage.tokensOut / 1_000_000) * price.outputPerMTok;

  // Sub-cent precision matters here: a single classification costs a fraction
  // of a cent and the daily total is a sum of hundreds of thousands of them.
  return { cost: Math.round(cost * 1e8) / 1e8, priced: true };
}

/** Merges a price override from `app_configs` onto the defaults. */
export function mergePricing(override: unknown): Record<string, ModelPrice> {
  const merged: Record<string, ModelPrice> = { ...DEFAULT_MODEL_PRICING };
  if (!override || typeof override !== 'object') return merged;

  for (const [model, value] of Object.entries(override as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<ModelPrice>;
    if (
      typeof candidate.inputPerMTok !== 'number' ||
      typeof candidate.outputPerMTok !== 'number'
    ) {
      continue;
    }
    merged[model] = {
      inputPerMTok: candidate.inputPerMTok,
      outputPerMTok: candidate.outputPerMTok,
    };
  }

  return merged;
}
