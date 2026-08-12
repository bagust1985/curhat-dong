import type { SafetyLevel } from '@curhat/database';

/**
 * AI→Human Bridge — E09-T06, PRD §10, DESIGN-REF §2.8c.
 *
 * The card that points at a real person. Two failure modes bound this: showing
 * it every reply reads as being shown the door, and never showing it makes
 * DONG AI the destination instead of the doorway — which the AI Rules
 * explicitly forbid ("dilarang mendorong isolasi dari manusia nyata").
 *
 * Pure and deterministic so the cadence can be tested rather than eyeballed.
 */

export interface BridgeCard {
  message: string;
  ctaLabel: string;
  action: 'find_listener';
  /** Carried into the listener request form so nothing has to be retyped. */
  prefill: { topic?: string; emotion?: string };
}

export interface BridgeDecision {
  show: boolean;
  reason: 'high_risk' | 'cadence' | null;
  card?: BridgeCard;
}

export interface BridgeInput {
  level: SafetyLevel;
  /** Assistant replies in this conversation, including the one being sent. */
  assistantTurns: number;
  minTurns: number;
  cooldownTurns: number;
  topic?: string | undefined;
  emotion?: string | undefined;
}

const MESSAGE =
  'Ada beberapa orang yang pernah mengalami situasi mirip dan siap mendengarkan.';
const CTA_LABEL = 'Cari Listener';

export function decideBridge(input: BridgeInput): BridgeDecision {
  const card: BridgeCard = {
    message: MESSAGE,
    ctaLabel: CTA_LABEL,
    action: 'find_listener',
    prefill: {
      ...(input.topic ? { topic: input.topic } : {}),
      ...(input.emotion ? { emotion: input.emotion } : {}),
    },
  };

  // High risk overrides the cadence entirely. Someone who needs a human now
  // should not have to wait for the counter to come round.
  if (input.level === 'L2' || input.level === 'L3') {
    return { show: true, reason: 'high_risk', card };
  }

  const cooldown = Math.max(1, input.cooldownTurns);
  if (input.assistantTurns >= input.minTurns) {
    if ((input.assistantTurns - input.minTurns) % cooldown === 0) {
      return { show: true, reason: 'cadence', card };
    }
  }

  return { show: false, reason: null };
}
