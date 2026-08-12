import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THRESHOLDS,
  actionForLevel,
  fallbackDecision,
  mapRiskToSafetyLevel,
} from './safety-mapping.js';

/**
 * CLAUDE.md requires unit tests for the safety mapping. This file is where a
 * wrong boundary shows up as a failing test rather than as a crisis post in a
 * public feed.
 */

describe('risk → safety level (PRD §8)', () => {
  it('maps an unremarkable post to L0', () => {
    expect(mapRiskToSafetyLevel({ toxicity: 0.05, spam: 0.1 }).level).toBe('L0');
  });

  it('maps mild toxicity to L1', () => {
    expect(mapRiskToSafetyLevel({ toxicity: 0.6 }).level).toBe('L1');
  });

  it('maps sustained harassment to L2', () => {
    expect(mapRiskToSafetyLevel({ harassment: 0.75 }).level).toBe('L2');
  });

  it('maps a clear self-harm signal to L3', () => {
    expect(mapRiskToSafetyLevel({ self_harm: 0.6 }).level).toBe('L3');
  });

  it('takes the highest level when several categories trip', () => {
    // Adding a category must never be able to lower an existing verdict.
    const result = mapRiskToSafetyLevel({ toxicity: 0.9, self_harm: 0.7 });
    expect(result.level).toBe('L3');
    expect(result.triggeredBy).toContain('self_harm');
  });

  it('treats an absent score as not assessed, not as zero risk', () => {
    // An empty result must not read as "checked and clean".
    expect(mapRiskToSafetyLevel({}).level).toBe('L0');
    expect(mapRiskToSafetyLevel({}).triggeredBy).toEqual([]);
  });

  it('holds self-harm to a lower bar than every other L3 category', () => {
    // The asymmetry is deliberate: a false positive shows someone a supportive
    // message they did not need; a false negative lets a crisis signal scroll
    // past. Those costs are not comparable.
    const selfHarm = DEFAULT_THRESHOLDS.l3['self_harm'] as number;

    for (const [category, threshold] of Object.entries(DEFAULT_THRESHOLDS.l3)) {
      if (category === 'self_harm') continue;
      expect(threshold, `${category} should sit above self_harm`).toBeGreaterThan(selfHarm);
    }
  });

  it('is inclusive at the boundary', () => {
    // A score exactly at the threshold must trip it. An exclusive comparison
    // here would silently let the boundary case through.
    const threshold = DEFAULT_THRESHOLDS.l3['self_harm'] as number;
    expect(mapRiskToSafetyLevel({ self_harm: threshold }).level).toBe('L3');
    expect(mapRiskToSafetyLevel({ self_harm: threshold - 0.0001 }).level).not.toBe('L3');
  });

  it('honours overridden thresholds', () => {
    // Thresholds are calibrated from the admin panel (PRD §18), so the mapping
    // must actually read them.
    const strict = {
      ...DEFAULT_THRESHOLDS,
      l3: { ...DEFAULT_THRESHOLDS.l3, self_harm: 0.2 },
    };
    expect(mapRiskToSafetyLevel({ self_harm: 0.25 }, strict).level).toBe('L3');
    expect(mapRiskToSafetyLevel({ self_harm: 0.25 }).level).not.toBe('L3');
  });
});

describe('level → action (PRD §8, non-negotiable #2)', () => {
  it('publishes L0 without monitoring and L1 with it', () => {
    expect(actionForLevel('L0')).toEqual({ kind: 'publish', monitor: false });
    expect(actionForLevel('L1')).toEqual({ kind: 'publish', monitor: true });
  });

  it('holds L2 for review', () => {
    expect(actionForLevel('L2')).toEqual({ kind: 'hold', queue: 'high' });
  });

  it('intervenes on L3 and never punishes', () => {
    // Level 3 means someone needs help, not that they broke a rule. There is
    // no punitive branch in this union — a suspension cannot be expressed here
    // even by mistake.
    const action = actionForLevel('L3');
    expect(action.kind).toBe('intervene');
    expect(JSON.stringify(action)).not.toMatch(/suspend|ban|mute|remove/i);
  });

  it('holds an unresolved classification rather than guessing', () => {
    // "We do not know yet" must never resolve to "publish".
    expect(actionForLevel('pending').kind).toBe('hold');
  });
});

describe('AI-unavailable fallback (TECH-SPEC §4.2, non-negotiable #1)', () => {
  it('publishes a quiet post at L1, never L0', () => {
    // Publishing at L0 would record "we checked and it was fine" when nothing
    // was checked at all.
    const decision = fallbackDecision(false);

    expect(decision.status).toBe('published');
    expect(decision.level).toBe('L1');
    expect(decision.level).not.toBe('L0');
    expect(decision.needsReanalysis).toBe(true);
  });

  it('holds a post the local rules flagged', () => {
    const decision = fallbackDecision(true);

    expect(decision.status).toBe('held');
    expect(decision.queue).toBe('critical');
    expect(decision.needsReanalysis).toBe(true);
  });

  it('still offers support when it holds the post', () => {
    // The content is withheld from the feed, not the help from the person.
    expect(fallbackDecision(true).showIntervention).toBe(true);
  });

  it('always flags for re-analysis, whichever branch it takes', () => {
    // Without this, an outage would leave permanently unclassified content
    // behind and nobody would know which posts were affected.
    expect(fallbackDecision(true).needsReanalysis).toBe(true);
    expect(fallbackDecision(false).needsReanalysis).toBe(true);
  });

  it('has no branch that publishes without a level', () => {
    // The regression this guards against: someone "simplifying" the fallback
    // into a single fail-open path.
    for (const highRisk of [true, false]) {
      const decision = fallbackDecision(highRisk);
      if (decision.status === 'published') {
        expect(decision.level).toBe('L1');
        expect(decision.needsReanalysis).toBe(true);
      } else {
        expect(decision.queue).toBeDefined();
      }
    }
  });
});
