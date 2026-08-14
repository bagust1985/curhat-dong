import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { THEMES, type ThemeName } from './tokens.js';

/**
 * globals.css must agree with tokens.ts — E18-T07.
 *
 * The palette exists in three places: this CSS (what the browser actually
 * paints), `lib/tokens.ts` (what every test asserts against), and
 * `apps/mobile/lib/tokens.ts` (what the phone paints). The third is guarded by
 * the mobile suite. This closes the first, which globals.css has been openly
 * admitting was unguarded: "a change here without a change there is a silent
 * divergence".
 *
 * That gap mattered more than it looks. Every contrast assertion in
 * `contrast.test.ts` reads tokens.ts, so a hex that was right there and wrong
 * in the CSS would ship a palette nobody had ever checked, with a fully green
 * suite.
 */

// Resolved from the package root rather than `import.meta.url`: these tests run
// in the jsdom environment, where import.meta.url is an http URL and readFileSync
// refuses it. Vitest runs each package's script from that package's directory.
const CSS = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

/** Reads the custom properties out of one CSS block, keyed like ThemeTokens. */
function declaredIn(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`globals.css has no "${selector}" block`);

  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  const block = CSS.slice(open, close);

  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    const key = (name as string).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    found[key] = (value as string).toLowerCase();
  }
  return found;
}

const BLOCKS: Record<ThemeName, string> = {
  light: ':root {',
  dark: "[data-theme='dark'] {",
  midnight: "[data-theme='midnight'] {",
};

describe('the CSS paints what the tokens promise', () => {
  it.each(Object.keys(BLOCKS) as ThemeName[])('%s matches lib/tokens.ts', (name) => {
    const css = declaredIn(BLOCKS[name]);
    const ts = THEMES[name] as unknown as Record<string, string>;

    // A regex that quietly matched nothing would turn this into a green light
    // for any divergence at all.
    expect(Object.keys(css).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(css).sort()).toEqual(Object.keys(ts).sort());

    for (const [key, value] of Object.entries(ts)) {
      expect(css[key], `${name}.${key}`).toBe(value);
    }
  });

  it('keeps the no-JS dark fallback identical to the dark theme', () => {
    // `@media (prefers-color-scheme: dark) :root:not([data-theme])` exists for
    // readers with no stored choice, and its values are hand-copied from the
    // dark block. Two lists maintained by hand is exactly where one entry gets
    // missed — and the person who sees it is the one who never opened settings.
    const fallback = declaredIn(':root:not([data-theme]) {');

    expect(Object.keys(fallback).sort()).toEqual(Object.keys(THEMES.dark).sort());
    for (const [key, value] of Object.entries(THEMES.dark)) {
      expect(fallback[key], `fallback.${key}`).toBe(value);
    }
  });
});
