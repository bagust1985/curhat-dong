import { describe, expect, it } from 'vitest';

import { AA_NORMAL_TEXT, AA_UI_COMPONENT, contrastRatio } from './contrast.js';
import {
  FONT_STACK,
  MIN_TOUCH_TARGET_PX,
  RADII,
  THEMES,
  isMidnightHour,
  themeForHour,
  type ThemeName,
} from './tokens.js';

const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

/**
 * E15-T01 — accessibility as an acceptance criterion (PRD §23.1).
 *
 * Every theme is checked, Midnight Mode included. The task says not to trust
 * the eye, and it is right: two pairings taken straight from the brand kit fail
 * AA, and neither looks wrong.
 */
describe('body and secondary text (PRD §23.1)', () => {
  it.each(THEME_NAMES)('%s: text is readable on every surface', (name) => {
    const t = THEMES[name];

    for (const ground of [t.bg, t.surface, t.surfaceAlt]) {
      expect(contrastRatio(t.text, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it.each(THEME_NAMES)('%s: muted text clears normal-text AA, not the UI bar', (name) => {
    const t = THEMES[name];

    // Muted carries timestamps and helper copy. It is still body text, so it
    // gets 4.5:1 — "muted" must not quietly mean "unreadable".
    for (const ground of [t.bg, t.surface, t.surfaceAlt]) {
      expect(contrastRatio(t.muted, ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});

describe('primary actions', () => {
  it.each(THEME_NAMES)('%s: a label on the primary fill is readable', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.primaryFg, t.primary)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_NAMES)('%s: the primary fill is distinguishable from the page', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.primary, t.bg)).toBeGreaterThanOrEqual(AA_UI_COMPONENT);
  });
});

describe('the brand kit values that do not pass on their own', () => {
  it('does not use raw brand purple as a fill for normal text', () => {
    // #FFFFFF on #7C5CFC is 4.38:1 — under 4.5. The mock's "Mulai Curhat"
    // button is exactly that pairing, so `primary` is deepened instead and the
    // brand purple is reserved for large type, icons and outlines.
    expect(contrastRatio('#ffffff', '#7c5cfc')).toBeLessThan(AA_NORMAL_TEXT);
    expect(THEMES.light.primary).not.toBe('#7c5cfc');
    expect(contrastRatio(THEMES.light.primaryFg, THEMES.light.primary)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('never puts white text on brand pink', () => {
    // 2.76:1 — a bad failure, not a marginal one. Pink is decoration or takes
    // dark ink; it is never a button that carries `primaryFg`.
    expect(contrastRatio('#ffffff', '#ff688a')).toBeLessThan(3);

    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(t.primary, name).not.toBe(t.accentPink);
      // Whatever ink the accents take, it must be legible on them.
      expect(contrastRatio(t.accentFg, t.accentPink), name).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
      expect(contrastRatio(t.accentFg, t.accentAmber), name).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it('keeps brand purple usable for large text and outlines', () => {
    // It fails 4.5:1 but clears 3:1, which is the bar for large text and UI
    // components — so it stays in the system rather than being discarded.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(contrastRatio(t.brand, t.bg), name).toBeGreaterThanOrEqual(AA_UI_COMPONENT);
    }
  });
});

describe('destructive and focus', () => {
  it.each(THEME_NAMES)('%s: danger is readable and reversible-looking', (name) => {
    const t = THEMES[name];
    expect(contrastRatio(t.danger, t.bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(t.dangerFg, t.danger)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('reserves red for destructive actions only', () => {
    // DESIGN-REF §0: aggressive red is for destructive actions. If danger were
    // reused as an accent, "are you sure?" would stop reading as a warning.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(t.danger, name).not.toBe(t.accentPink);
      expect(t.danger, name).not.toBe(t.primary);
      expect(t.danger, name).not.toBe(t.brand);
    }
  });

  it.each(THEME_NAMES)('%s: the focus ring is visible on every surface', (name) => {
    const t = THEMES[name];

    // Full keyboard navigation with visible focus is an acceptance criterion
    // (PRD §23.1), and a ring nobody can see is the same as no ring.
    for (const ground of [t.bg, t.surface, t.surfaceAlt]) {
      expect(contrastRatio(t.focus, ground)).toBeGreaterThanOrEqual(AA_UI_COMPONENT);
    }
  });

  it.each(THEME_NAMES)('%s: hairlines are actually visible', (name) => {
    const t = THEMES[name];

    // Not a WCAG requirement — a border is decorative. But a border at 1.05:1
    // is a border nobody can see, and card edges are how this layout reads at
    // all. 1.2 is a floor against invisibility, not an accessibility claim.
    expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(1.2);
  });
});

describe('Midnight Mode (DESIGN-REF §0)', () => {
  it('covers 21:00 through 03:59', () => {
    for (const hour of [21, 22, 23, 0, 1, 2, 3]) {
      expect(isMidnightHour(hour), String(hour)).toBe(true);
    }
  });

  it('does not cover daytime hours', () => {
    for (const hour of [4, 8, 12, 17, 20]) {
      expect(isMidnightHour(hour), String(hour)).toBe(false);
    }
  });

  it('is dimmer than dark without becoming less readable', () => {
    // The failure mode of a night theme is dimming the *text* along with the
    // ground, which reads as tasteful and is unusable.
    expect(contrastRatio(THEMES.midnight.text, THEMES.midnight.bg)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
    expect(contrastRatio('#ffffff', THEMES.midnight.bg)).toBeGreaterThan(
      contrastRatio('#ffffff', THEMES.dark.bg),
    );
  });

  it('never overrides a light-theme preference', () => {
    // Dimming somebody's screen because of the clock, against a setting they
    // chose, is the app deciding it knows better.
    expect(themeForHour('light', 23)).toBe('light');
    expect(themeForHour('light', 2)).toBe('light');
  });

  it('replaces dark at night and restores it by day', () => {
    expect(themeForHour('dark', 23)).toBe('midnight');
    expect(themeForHour('dark', 2)).toBe('midnight');
    expect(themeForHour('dark', 12)).toBe('dark');
  });

  it('follows the system preference when asked to', () => {
    expect(themeForHour('system', 12, false)).toBe('light');
    expect(themeForHour('system', 12, true)).toBe('dark');
    expect(themeForHour('system', 23, true)).toBe('midnight');
    // System-light at night stays light — the clock does not override it here
    // either.
    expect(themeForHour('system', 23, false)).toBe('light');
  });
});

describe('shape, type and touch (DESIGN-REF §0, PRD §23.1)', () => {
  it('uses generous radii rather than administrative corners', () => {
    expect(RADII.lg).toBe('1rem');
    expect(Number.parseFloat(RADII.xl)).toBeGreaterThanOrEqual(1);
  });

  it('leads with a rounded sans', () => {
    // The brand kit's Nunito. A geometric sans would make this read as
    // software rather than somewhere to talk.
    expect(FONT_STACK).toContain('Nunito');
    expect(FONT_STACK).toContain('ui-rounded');
  });

  it('holds every target to 44px', () => {
    // Applies to the six reaction buttons too, which is exactly where a
    // minimum target stops being theoretical.
    expect(MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});
