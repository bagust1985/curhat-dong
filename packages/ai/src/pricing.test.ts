import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_PRICING, estimateCost, mergePricing } from './pricing.js';

describe('cost estimation (E08-T05)', () => {
  it('prices a call from the per-model table', () => {
    const result = estimateCost('claude-haiku-4-5', { tokensIn: 1_000_000, tokensOut: 200_000 });

    // 1.00 USD input + 0.2 * 5.00 USD output
    expect(result.priced).toBe(true);
    expect(result.cost).toBeCloseTo(2, 6);
  });

  it('reports an unpriced model instead of quietly charging zero', () => {
    const result = estimateCost('some-model-nobody-priced', { tokensIn: 10_000, tokensOut: 500 });

    expect(result).toEqual({ cost: 0, priced: false });
  });

  it('accepts a price update from config', () => {
    const table = mergePricing({ 'claude-haiku-4-5': { inputPerMTok: 2, outputPerMTok: 10 } });

    expect(estimateCost('claude-haiku-4-5', { tokensIn: 1_000_000, tokensOut: 0 }, table).cost)
      .toBeCloseTo(2, 6);
    // Untouched rows survive the merge.
    expect(table['claude-sonnet-5']).toEqual(DEFAULT_MODEL_PRICING['claude-sonnet-5']);
  });

  it('ignores malformed price rows', () => {
    const table = mergePricing({ 'claude-sonnet-5': { inputPerMTok: 'free' } });

    expect(table['claude-sonnet-5']).toEqual(DEFAULT_MODEL_PRICING['claude-sonnet-5']);
  });
});
