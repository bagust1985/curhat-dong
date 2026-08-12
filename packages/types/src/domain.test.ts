import { describe, expect, it } from 'vitest';

import {
  APPEALABLE_ACTIONS,
  FELT_HEARD_ANSWERS,
  INTENTS,
  MOODS,
  MOOD_LABELS,
  INTENT_LABELS,
  QUIET_HOURS_EXEMPT_TYPES,
  REACTIONS,
  REACTION_LABELS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  REQUIRED_CONSENT_TYPES,
  feltHeardRate,
  isAppealable,
} from './domain.js';
import { NOTIFICATION_TEMPLATES } from './events.js';

describe('domain vocabulary matches the PRD', () => {
  it('has 11 moods, 4 intents, 6 reactions, 10 report categories', () => {
    expect(MOODS).toHaveLength(11);
    expect(INTENTS).toHaveLength(4);
    expect(REACTIONS).toHaveLength(6);
    expect(REPORT_CATEGORIES).toHaveLength(10);
  });

  it('gives every enum value an Indonesian label', () => {
    for (const mood of MOODS) expect(MOOD_LABELS[mood]).toBeTruthy();
    for (const intent of INTENTS) expect(INTENT_LABELS[intent]).toBeTruthy();
    for (const reaction of REACTIONS) expect(REACTION_LABELS[reaction]).toBeTruthy();
    for (const category of REPORT_CATEGORIES) expect(REPORT_CATEGORY_LABELS[category]).toBeTruthy();
  });
});

describe('moderation appeals (PRD §15.4)', () => {
  it('marks punitive actions appealable', () => {
    for (const action of APPEALABLE_ACTIONS) expect(isAppealable(action)).toBe(true);
  });

  it('does not offer an appeal for approve or escalate', () => {
    expect(isAppealable('approve')).toBe(false);
    expect(isAppealable('escalate')).toBe(false);
  });
});

describe('Felt Heard Rate (PRD §9, §19.1)', () => {
  it('counts yes and somewhat as positive', () => {
    expect(feltHeardRate({ yes: 6, somewhat: 2, no: 2 })).toBeCloseTo(0.8);
  });

  it('returns null rather than dividing by zero', () => {
    expect(feltHeardRate({ yes: 0, somewhat: 0, no: 0 })).toBeNull();
  });

  it('has no bucket for dismissed prompts', () => {
    // Dismissals are excluded from the denominator by construction: the answer
    // union has no "dismissed" member, so a dismissal cannot be counted as
    // "no" by accident. Counting it would measure annoyance, not being heard.
    expect(FELT_HEARD_ANSWERS).toEqual(['yes', 'somewhat', 'no']);
  });
});

describe('consent (PRD §25.3)', () => {
  it('requires ToS and sensitive processing, but never analytics', () => {
    expect(REQUIRED_CONSENT_TYPES).toContain('tos_privacy');
    expect(REQUIRED_CONSENT_TYPES).toContain('sensitive_processing');
    expect(REQUIRED_CONSENT_TYPES).not.toContain('analytics');
  });
});

describe('notification privacy (CLAUDE.md non-negotiable #3)', () => {
  it('exempts only safety and account notifications from quiet hours', () => {
    expect([...QUIET_HOURS_EXEMPT_TYPES].sort()).toEqual(['account', 'safety']);
    expect(QUIET_HOURS_EXEMPT_TYPES).not.toContain('listener');
    expect(QUIET_HOURS_EXEMPT_TYPES).not.toContain('social');
  });

  it('keeps notification copy to a closed template set', () => {
    // Free-text notification bodies are how curhat content leaks onto a lock
    // screen. Templates are the enforcement point.
    const templates = Object.values(NOTIFICATION_TEMPLATES);
    expect(templates.length).toBeGreaterThan(0);
    for (const copy of templates) {
      expect(typeof copy).toBe('string');
      expect(copy.length).toBeLessThan(120);
    }
  });
});
