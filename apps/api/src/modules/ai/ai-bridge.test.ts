import { describe, expect, it } from 'vitest';

import { decideBridge } from './ai-bridge.js';
import { conversationTitle } from './conversation-title.js';
import { estimateTokens } from './context-builder.service.js';

const cadence = { minTurns: 4, cooldownTurns: 6 };

describe('AI→Human bridge (E09-T06)', () => {
  it('stays quiet in the first few turns', () => {
    for (let turn = 1; turn < 4; turn += 1) {
      expect(decideBridge({ level: 'L0', assistantTurns: turn, ...cadence }).show).toBe(false);
    }
  });

  it('appears once the conversation has some weight, then keeps its distance', () => {
    const shown = [...Array(20).keys()]
      .map((index) => index + 1)
      .filter((turn) => decideBridge({ level: 'L0', assistantTurns: turn, ...cadence }).show);

    // Not every reply — that reads as being shown the door (PRD §10).
    expect(shown).toEqual([4, 10, 16]);
  });

  it('ignores the cadence entirely when risk is high', () => {
    for (const level of ['L2', 'L3'] as const) {
      const decision = decideBridge({ level, assistantTurns: 1, ...cadence });

      expect(decision).toMatchObject({ show: true, reason: 'high_risk' });
      expect(decision.card?.action).toBe('find_listener');
    }
  });

  it('prefills the listener request so nothing has to be retyped', () => {
    const decision = decideBridge({
      level: 'L3',
      assistantTurns: 1,
      topic: 'kerjaan',
      emotion: 'lelah',
      ...cadence,
    });

    expect(decision.card?.prefill).toEqual({ topic: 'kerjaan', emotion: 'lelah' });
    expect(decision.card?.ctaLabel).toBe('Cari Listener');
  });

  it('carries no card when it is not showing', () => {
    expect(decideBridge({ level: 'L0', assistantTurns: 2, ...cadence }).card).toBeUndefined();
  });
});

describe('conversation titles (E09-T01)', () => {
  const at = new Date('2026-08-12T02:00:00Z'); // 09:00 WIB, 12 Aug

  it('never echoes what was written', () => {
    // A topic the classifier invented, or one that would be painful on a
    // lock screen, falls back to the date.
    for (const topic of ['percobaan bunuh diri', 'kekerasan di rumah', 'sesuatu yang aneh']) {
      expect(conversationTitle({ topic, at })).toBe('Obrolan 12 Agustus');
    }
  });

  it('uses a known category label when there is one', () => {
    expect(conversationTitle({ topic: 'work', at })).toBe('Obrolan soal kerjaan');
    expect(conversationTitle({ topic: 'Keluarga', at })).toBe('Obrolan soal keluarga');
  });

  it('falls back to the WIB date', () => {
    expect(conversationTitle({ at })).toBe('Obrolan 12 Agustus');
    // 23:30 UTC on the 11th is already the 12th in Jakarta.
    expect(conversationTitle({ at: new Date('2026-08-11T23:30:00Z') })).toBe('Obrolan 12 Agustus');
  });
});

describe('token estimation (E09-T04)', () => {
  it('grows with length and never under-reports an empty string', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('halo')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
