import { describe, expect, it } from 'vitest';

import {
  MIN_TOUCH_TARGET_PX as WEB_TOUCH,
  RADII as WEB_RADII,
  THEMES as WEB_THEMES,
} from '../../web/lib/tokens.js';
import { RADIUS, THEMES, TOUCH_TARGET, type ThemeTokens } from './tokens.js';

/**
 * The web/mobile drift guard — E18-T05.
 *
 * `lib/tokens.ts` and `tailwind.config.js` have both claimed since E16-T01 that
 * this file exists and fails when the palettes diverge. It did not. The web
 * moved to a rose palette across a dozen commits and the phone stayed lavender
 * with the whole suite green — which is exactly the failure the comment
 * promised to prevent. A safety net that lives only in a comment is worse than
 * none, because people trust it.
 *
 * The web module is imported rather than parsed. It is plain data with no
 * dependencies, so comparing the real objects is both simpler and stricter than
 * a regex over the source — a regex that quietly matched nothing would turn
 * this file back into the green light it used to be. Nothing here reaches the
 * Metro bundle: a `.test.ts` is never part of an app entry graph.
 */

const THEME_NAMES = ['light', 'dark', 'midnight'] as const;

describe('the phone and the browser paint the same product', () => {
  it.each(THEME_NAMES)('%s matches apps/web/lib/tokens.ts exactly', (name) => {
    const web = WEB_THEMES[name] as unknown as Record<string, string>;
    const mobile = THEMES[name] as unknown as Record<string, string>;

    for (const [key, value] of Object.entries(web)) {
      expect(mobile[key], `${name}.${key}`).toBe(value);
    }
  });

  it('carries every token the web defines, and no extras', () => {
    // Extras matter as much as omissions: a colour that exists only on the
    // phone is a colour nobody chose for the product.
    expect(Object.keys(THEMES.light).sort()).toEqual(Object.keys(WEB_THEMES.light).sort());
  });
});

describe('shape and touch match the web', () => {
  it('uses the same card radius', () => {
    // The web stores rem; React Native has no rem, so the comparison is in px.
    expect(RADIUS.curhat).toBe(Number.parseFloat(WEB_RADII.lg) * 16);
  });

  it('keeps actions and chips as pills on both platforms', () => {
    // 999 and 9999 are the same shape once the box is smaller than either;
    // what matters is that neither has quietly become a small number.
    expect(Number.parseFloat(WEB_RADII.xl)).toBeGreaterThanOrEqual(999);
    expect(RADIUS.action).toBeGreaterThanOrEqual(999);
    expect(RADIUS.chip).toBeGreaterThanOrEqual(999);
  });

  it('holds the same 44px touch floor', () => {
    expect(TOUCH_TARGET).toBe(WEB_TOUCH);
  });
});

describe('the rules the palette rests on hold here too', () => {
  it('never lets the brand pink become a button fill', () => {
    // White on #FA4B7D is 3.30:1. The web asserts that numerically; here the
    // same rule is structural — if `brand` and `primary` were one colour, a
    // button would inherit a fill that cannot carry its own label.
    for (const name of THEME_NAMES) {
      const t: ThemeTokens = THEMES[name];
      expect(t.primary, name).not.toBe(t.brand);
    }
  });

  it('keeps destructive apart from the primary rose', () => {
    for (const name of THEME_NAMES) {
      const t: ThemeTokens = THEMES[name];
      expect(t.danger, name).not.toBe(t.primary);
      expect(t.danger, name).not.toBe(t.brand);
    }
  });
});
