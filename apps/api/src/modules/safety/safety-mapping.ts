import type { SafetyLevel } from '@curhat/database';

import type { RiskScores } from './safety-classifier.port.js';

/**
 * Risk scores → safety level — PRD §8, TECH-SPEC §4.1.
 *
 * Pure functions with no I/O, because CLAUDE.md requires unit tests for the
 * safety mapping and this is the piece where a wrong boundary means a crisis
 * post is published or an ordinary one is buried.
 *
 *   L0 normal          → publish
 *   L1 sensitive       → publish + monitor
 *   L2 potential harm  → HOLD + moderation case
 *   L3 immediate risk  → do not publish + supportive intervention + Critical
 */

export interface SafetyThresholds {
  /** Any category at or above this is L3. */
  l3: Record<string, number>;
  /** Any category at or above this is L2. */
  l2: Record<string, number>;
  /** Any category at or above this is L1. */
  l1: Record<string, number>;
}

/**
 * Defaults, overridable from `app_configs` via the admin panel (PRD §18).
 *
 * Self-harm sits lower than every other category at L3. That asymmetry is the
 * point: a false positive means someone is shown a supportive message they did
 * not need, a false negative means a crisis signal is published and scrolls
 * past. Those costs are not comparable, so the thresholds are not either.
 */
export const DEFAULT_THRESHOLDS: SafetyThresholds = {
  l3: {
    self_harm: 0.5,
    threat: 0.8,
    violence: 0.85,
    sexual: 0.9,
  },
  l2: {
    self_harm: 0.3,
    threat: 0.55,
    violence: 0.6,
    sexual: 0.6,
    harassment: 0.7,
    hate: 0.7,
    doxxing: 0.7,
    scam: 0.75,
  },
  l1: {
    self_harm: 0.15,
    toxicity: 0.5,
    harassment: 0.45,
    hate: 0.45,
    violence: 0.4,
    sexual: 0.4,
    scam: 0.5,
    spam: 0.7,
  },
};

export interface MappingResult {
  level: SafetyLevel;
  /** Categories that pushed it to this level. Internal only, never shown. */
  triggeredBy: string[];
}

function categoriesAtOrAbove(
  scores: RiskScores,
  thresholds: Record<string, number>,
): string[] {
  const triggered: string[] = [];

  for (const [category, threshold] of Object.entries(thresholds)) {
    const score = (scores as Record<string, number | undefined>)[category];
    if (typeof score === 'number' && score >= threshold) {
      triggered.push(category);
    }
  }

  return triggered;
}

/**
 * Maps scores to a level.
 *
 * Evaluated highest-first: a post that trips both an L1 and an L3 threshold is
 * L3. Taking the maximum rather than the first match means adding a category
 * cannot accidentally lower an existing verdict.
 */
export function mapRiskToSafetyLevel(
  scores: RiskScores,
  thresholds: SafetyThresholds = DEFAULT_THRESHOLDS,
): MappingResult {
  const l3 = categoriesAtOrAbove(scores, thresholds.l3);
  if (l3.length > 0) return { level: 'L3', triggeredBy: l3 };

  const l2 = categoriesAtOrAbove(scores, thresholds.l2);
  if (l2.length > 0) return { level: 'L2', triggeredBy: l2 };

  const l1 = categoriesAtOrAbove(scores, thresholds.l1);
  if (l1.length > 0) return { level: 'L1', triggeredBy: l1 };

  return { level: 'L0', triggeredBy: [] };
}

export type SafetyAction =
  | { kind: 'publish'; monitor: boolean }
  | { kind: 'hold'; queue: 'high' | 'medium' }
  | { kind: 'intervene' };

/**
 * Level → what actually happens — PRD §8.
 *
 * L3 produces `intervene`, and there is deliberately no punitive variant in
 * this union. Level 3 means someone needs help, not that they broke a rule
 * (CLAUDE.md non-negotiable #2) — a suspension cannot be expressed here even
 * by mistake.
 */
export function actionForLevel(level: SafetyLevel): SafetyAction {
  switch (level) {
    case 'L0':
      return { kind: 'publish', monitor: false };
    case 'L1':
      return { kind: 'publish', monitor: true };
    case 'L2':
      return { kind: 'hold', queue: 'high' };
    case 'L3':
      return { kind: 'intervene' };
    case 'pending':
      // Unresolved: hold rather than guess. "We do not know yet" must never
      // resolve to "publish".
      return { kind: 'hold', queue: 'high' };
  }
}

/**
 * The AI-unavailable fallback — TECH-SPEC §4.2, BAGIAN 16.
 *
 * There is deliberately no single global fail-open rule:
 *
 *   local rules quiet      → publish at L1, queue re-analysis
 *   local high-risk signal → HOLD, retry AI, open a Critical/High case
 *
 * A provider outage must never become a way to publish unchecked content
 * (CLAUDE.md non-negotiable #1).
 */
export interface FallbackDecision {
  level: SafetyLevel;
  status: 'published' | 'held';
  needsReanalysis: boolean;
  queue?: 'critical' | 'high';
  showIntervention: boolean;
}

export function fallbackDecision(localHighRisk: boolean): FallbackDecision {
  if (localHighRisk) {
    return {
      level: 'pending',
      status: 'held',
      needsReanalysis: true,
      queue: 'critical',
      // The person still sees support resources — the content is withheld from
      // the feed, not the help from them.
      showIntervention: true,
    };
  }

  return {
    level: 'L1',
    status: 'published',
    // Never L0: "we did not check" is not the same statement as "we checked
    // and it was fine".
    needsReanalysis: true,
    showIntervention: false,
  };
}
