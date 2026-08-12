import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROUTING,
  isAmbiguousRisk,
  mergeRoutingConfig,
  modelFor,
  resolveTier,
} from './routing.js';

describe('model routing (E08-T03)', () => {
  it('sends cheap work to the cheap tier', () => {
    expect(resolveTier({ operation: 'classify_emotion' }, DEFAULT_ROUTING).tier).toBe('cheap');
    expect(resolveTier({ operation: 'detect_intent' }, DEFAULT_ROUTING).tier).toBe('cheap');
  });

  it('sends conversation to the advanced tier', () => {
    expect(resolveTier({ operation: 'chat' }, DEFAULT_ROUTING)).toEqual({
      tier: 'advanced',
      reason: 'operation_default',
    });
  });

  it('escalates ambiguous safety input to the advanced model', () => {
    expect(resolveTier({ operation: 'assess_risk', ambiguous: true }, DEFAULT_ROUTING)).toEqual({
      tier: 'advanced',
      reason: 'safety_escalation',
    });
    expect(resolveTier({ operation: 'moderate', ambiguous: true }, DEFAULT_ROUTING).tier).toBe(
      'advanced',
    );
  });

  it('never degrades a safety operation, even under budget pressure', () => {
    // This is CLAUDE.md non-negotiable #1 expressed as a test: cost pressure
    // must not reach the code path that classifies risk.
    const degraded = resolveTier(
      { operation: 'assess_risk', ambiguous: true, degraded: true },
      DEFAULT_ROUTING,
    );

    expect(degraded).toEqual({ tier: 'advanced', reason: 'safety_escalation' });
  });

  it('degrades non-safety work when the budget guard says so', () => {
    expect(resolveTier({ operation: 'chat', degraded: true }, DEFAULT_ROUTING)).toEqual({
      tier: 'cheap',
      reason: 'budget_degraded',
    });
  });

  it('flags scores inside the ambiguity band', () => {
    const band = DEFAULT_ROUTING.ambiguityBand;

    expect(isAmbiguousRisk({ self_harm: 0.5 }, band)).toBe(true);
    expect(isAmbiguousRisk({ self_harm: 0.05, toxicity: 0.1 }, band)).toBe(false);
    expect(isAmbiguousRisk({ self_harm: 0.95 }, band)).toBe(false);
    expect(isAmbiguousRisk({}, band)).toBe(false);
  });

  it('takes routing overrides from config without touching code', () => {
    const config = mergeRoutingConfig({
      models: { anthropic: { advanced: 'claude-opus-5' } },
      advancedOperations: ['chat', 'assess_risk'],
    });

    expect(modelFor('anthropic', 'advanced', config)).toBe('claude-opus-5');
    expect(modelFor('anthropic', 'cheap', config)).toBe(DEFAULT_ROUTING.models.anthropic.cheap);
    expect(resolveTier({ operation: 'assess_risk' }, config).tier).toBe('advanced');
  });

  it('falls back to defaults for a malformed override', () => {
    expect(mergeRoutingConfig(null)).toEqual(DEFAULT_ROUTING);
    expect(mergeRoutingConfig('nonsense')).toEqual(DEFAULT_ROUTING);
  });
});
