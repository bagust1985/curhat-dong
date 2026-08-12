import { describe, expect, it } from 'vitest';

import { AA_NORMAL_TEXT, AA_UI_COMPONENT, contrastRatio } from './contrast.js';
import { THEMES, isMidnightHour, type ThemeName } from './tokens.js';

const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

describe('design tokens meet WCAG 2.1 AA (PRD §23.1)', () => {
  // Checked for every theme including Midnight Mode. Warm accent on a dark
  // ground is the combination most likely to slip under the threshold, which
  // is exactly why this runs in CI rather than being checked by eye once.
  it.each(THEME_NAMES)('%s: body text is readable on bg and surface', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_NAMES)('%s: muted text still clears normal-text AA', (name) => {
    const t = THEMES[name];
    // Muted is used for timestamps and helper copy — it is still body text,
    // so it gets the 4.5:1 bar, not the 3:1 one.
    expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(t.muted, t.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_NAMES)('%s: accent works as a UI component colour', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(AA_UI_COMPONENT);
    expect(contrastRatio(t.accent, t.surface)).toBeGreaterThanOrEqual(AA_UI_COMPONENT);
  });

  it.each(THEME_NAMES)('%s: label on an accent button is readable', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.accentFg, t.accent)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_NAMES)('%s: destructive colour is readable', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.danger, t.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe('Midnight Mode window (DESIGN-REF §0)', () => {
  it('covers 21:00 through 03:59', () => {
    expect(isMidnightHour(21)).toBe(true);
    expect(isMidnightHour(23)).toBe(true);
    expect(isMidnightHour(0)).toBe(true);
    expect(isMidnightHour(3)).toBe(true);
  });

  it('does not cover daytime hours', () => {
    expect(isMidnightHour(4)).toBe(false);
    expect(isMidnightHour(12)).toBe(false);
    expect(isMidnightHour(20)).toBe(false);
  });
});
