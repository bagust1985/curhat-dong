import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATES,
  GREETINGS,
  INTENTS,
  INTENT_LABELS,
  INTENT_VOCABULARY,
  MOODS,
  MOOD_LABELS,
  MOOD_VOCABULARY,
  REACTIONS,
  REACTION_LABELS,
  REACTION_VOCABULARY,
  type EmptyStateKey,
} from './vocabulary.js';

/**
 * E15-T02 — the acceptance criterion that everything else rests on.
 *
 * "Setiap ikon mood/reaction/intent punya label screen reader" is not a polish
 * item: 11 moods, 6 reactions and 4 intents *are* the core interaction. Miss one
 * label and that interaction is unavailable to a screen reader, silently.
 */
describe('every vocabulary value is labelled (PRD §23.1)', () => {
  it('covers all 11 moods', () => {
    expect(MOODS).toHaveLength(11);

    for (const mood of MOODS) {
      const entry = MOOD_VOCABULARY[mood];
      expect(entry, mood).toBeDefined();
      expect(entry.glyph.length, mood).toBeGreaterThan(0);
      expect(entry.a11yLabel.length, mood).toBeGreaterThan(4);
      expect(MOOD_LABELS[mood], mood).toBeTruthy();
    }
  });

  it('covers all 6 reactions', () => {
    expect(REACTIONS).toHaveLength(6);

    for (const reaction of REACTIONS) {
      const entry = REACTION_VOCABULARY[reaction];
      expect(entry, reaction).toBeDefined();
      expect(entry.a11yLabel.length, reaction).toBeGreaterThan(4);
      expect(REACTION_LABELS[reaction], reaction).toBeTruthy();
    }
  });

  it('covers all 4 intents', () => {
    expect(INTENTS).toHaveLength(4);

    for (const intent of INTENTS) {
      expect(INTENT_VOCABULARY[intent], intent).toBeDefined();
      expect(INTENT_VOCABULARY[intent].a11yLabel.length, intent).toBeGreaterThan(4);
      expect(INTENT_LABELS[intent], intent).toBeTruthy();
    }
  });

  it('never announces a bare glyph as the label', () => {
    // A screen reader reading "🫂" announces "hugging face", which tells the
    // listener nothing about what tapping it does.
    const all = [
      ...Object.values(MOOD_VOCABULARY),
      ...Object.values(REACTION_VOCABULARY),
      ...Object.values(INTENT_VOCABULARY),
    ];

    for (const entry of all) {
      expect(entry.a11yLabel).not.toBe(entry.glyph);
      expect(entry.a11yLabel).not.toContain(entry.glyph);
      // Announced out of context, so it says which axis it belongs to.
      expect(entry.a11yLabel).toMatch(/^(Mood|Beri reaksi|Yang dicari):/);
    }
  });

  it('gives every value a distinct spoken label', () => {
    // Two moods announcing the same thing is the same defect as one having no
    // label — the reader cannot tell them apart.
    for (const group of [MOOD_VOCABULARY, REACTION_VOCABULARY, INTENT_VOCABULARY]) {
      const labels = Object.values(group).map((entry) => entry.a11yLabel);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('meaning is not carried by colour alone (PRD §23.1)', () => {
  it('assigns a shape to every value', () => {
    for (const group of [MOOD_VOCABULARY, REACTION_VOCABULARY, INTENT_VOCABULARY]) {
      for (const [key, entry] of Object.entries(group)) {
        expect(entry.shape, key).toBeTruthy();
      }
    }
  });

  it('uses more than one shape within each group', () => {
    // A single shape everywhere would satisfy the type and defeat the purpose:
    // hue would be back to being the only differentiator.
    for (const group of [MOOD_VOCABULARY, REACTION_VOCABULARY, INTENT_VOCABULARY]) {
      const shapes = new Set(Object.values(group).map((entry) => entry.shape));
      expect(shapes.size).toBeGreaterThan(1);
    }
  });
});

describe('reactions are empathy words, not likes (PRD §9)', () => {
  it('has no single dominant approval reaction', () => {
    // No "like", no "love", nothing that reads as a verdict on someone's
    // feelings. Every reaction is a sentence a person could say.
    for (const label of Object.values(REACTION_LABELS)) {
      expect(label.toLowerCase()).not.toMatch(/\b(like|suka|love|bagus|keren|setuju)\b/);
    }
  });

  it('phrases every reaction in the first person', () => {
    // "Aku ngerti" is something a reader says. A thumbs-up is a rating.
    const labels = Object.values(REACTION_LABELS);
    const firstPerson = labels.filter((label) => /^(aku|peluk|tetap|cerita)/i.test(label));
    expect(firstPerson).toHaveLength(labels.length);
  });
});

describe('Midnight Mode copy (DESIGN-REF §0)', () => {
  it('does not greet a 2am reader cheerfully', () => {
    expect(GREETINGS.midnight).toBe('Belum tidur? Kalau ada yang mau diceritain, gue di sini.');
    expect(GREETINGS.midnight).not.toMatch(/selamat pagi|semangat|yuk/i);
  });

  it('differs from the daytime greeting', () => {
    expect(GREETINGS.midnight).not.toBe(GREETINGS.day);
  });
});

describe('empty states are warm and contextual (E15-T03)', () => {
  const keys = Object.keys(EMPTY_STATES) as EmptyStateKey[];

  it('gives every context its own words', () => {
    const titles = keys.map((key) => EMPTY_STATES[key].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('never reads like a system message', () => {
    for (const key of keys) {
      const { title, body } = EMPTY_STATES[key];
      expect(title, key).not.toMatch(/no data|kosong\.$|empty|tidak ada data|error/i);
      // A sentence, not a status: it ends in punctuation and speaks to someone.
      expect(title, key).toMatch(/[.?!]$/);
      expect(body.length, key).toBeGreaterThan(20);
    }
  });

  it('offers a way forward where one honestly exists', () => {
    // The feed's empty state invites a first post. "Butuh Didengar" being empty
    // is good news and gets no CTA — inventing one would be pushing somebody to
    // act for the sake of a button.
    expect(EMPTY_STATES.feed.action).toBe('Mulai curhat');
    expect(EMPTY_STATES.butuhDidengar.action).toBeNull();
    expect(EMPTY_STATES.comments.action).toBeNull();
  });

  it('does not blame the reader when a search finds nothing', () => {
    expect(EMPTY_STATES.search.body).not.toMatch(/salah|invalid|coba lagi yang benar/i);
  });
});
