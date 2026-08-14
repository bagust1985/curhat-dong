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
 * Hue angle in degrees. Two colours can both pass every contrast check and
 * still be the same colour to a reader — contrast measures lightness, not
 * whether "Hapus" looks like "Kirim".
 */
function hue(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;

  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;

  return ((sector * 60) % 360 + 360) % 360;
}

/** Shortest distance between two hue angles, 0–180. */
function hueGap(a: string, b: string): number {
  const raw = Math.abs(hue(a) - hue(b));
  return Math.min(raw, 360 - raw);
}

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
  it('never puts white text on the logo pink', () => {
    // #FFFFFF on #FA4B7D is 3.30:1 — under the 4.5 normal text needs. This is
    // the whole reason `primary` is a deeper rose: the identity colour cannot
    // be the button colour, in any theme.
    expect(contrastRatio('#ffffff', '#fa4b7d')).toBeLessThan(AA_NORMAL_TEXT);

    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(t.primary, name).not.toBe(t.brand);
    }
  });

  it('gives the brand pink dark ink wherever it is a fill', () => {
    // Used as a badge or chip ground it still has to be readable, and the ink
    // that works there is the dark plum, not white.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(contrastRatio(t.accentFg, t.brand), name).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.accentFg, t.accentAmber), name).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it('keeps the brand pink usable for large text and outlines', () => {
    // It fails 4.5:1 but clears 3:1, which is the bar for large text and UI
    // components — so it stays in the system rather than being discarded.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(contrastRatio(t.brand, t.bg), name).toBeGreaterThanOrEqual(AA_UI_COMPONENT);
    }
  });

  it('keeps the supporting lavender visible on every ground', () => {
    // DONG AI and system actions ride on this. It is a UI colour, so 3:1.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(contrastRatio(t.accentLavender, t.bg), name).toBeGreaterThanOrEqual(
        AA_UI_COMPONENT,
      );
    }
  });

  it('lets the lavender be a button, unlike the brand pink', () => {
    // The DONG AI entry card fills a button with it, so unlike `brand` this one
    // does have to hold `primaryFg` at full text contrast.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(contrastRatio(t.primaryFg, t.accentLavender), name).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
  });

  it('lets the rose ink sit on the pink tint, for the active nav row', () => {
    // E18-T04: the active row is a soft tint carrying `primary` ink, so the
    // solid rose stays the composer button's alone. That pairing is the whole
    // signal, so it has to clear normal-text contrast — light is the tight one
    // at 4.65:1, which is exactly why this is asserted rather than eyeballed.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(contrastRatio(t.primary, t.tintPink), name).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('keeps body text readable on every soft tint', () => {
    // The tints ground the quick-link tiles and the AI card. A tint that only
    // "looks light" is how a tile becomes unreadable in one theme out of three.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      for (const tint of [t.tintPink, t.tintLavender, t.tintAmber, t.tintRose]) {
        expect(contrastRatio(t.text, tint), `${name} ${tint}`).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT,
        );
      }
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
      expect(t.danger, name).not.toBe(t.brand);
      expect(t.danger, name).not.toBe(t.primary);
      expect(t.danger, name).not.toBe(t.accentLavender);
    }
  });

  it('keeps destructive far enough from the primary rose to be a different colour', () => {
    // Not covered by any contrast check, and the reason `danger` moved to burnt
    // brick in E18-T01: with a magenta-rose primary the old #B3261E sat 11° of
    // hue away, so "Hapus" and "Kirim" were near-twins. Sitting them side by
    // side is a normal thing for a confirm dialog to do.
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(hueGap(t.danger, t.primary), `${name} danger vs primary`).toBeGreaterThanOrEqual(25);
      expect(hueGap(t.danger, t.brand), `${name} danger vs brand`).toBeGreaterThanOrEqual(25);
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
    // §0 asks for 16–20px on cards. Asserting the range rather than one literal
    // leaves room to tune inside it without the test becoming a rubber stamp.
    const cardRadiusPx = Number.parseFloat(RADII.lg) * 16;
    expect(cardRadiusPx).toBeGreaterThanOrEqual(16);
    expect(cardRadiusPx).toBeLessThanOrEqual(20);
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
