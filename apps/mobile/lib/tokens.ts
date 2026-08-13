/**
 * Design tokens for React Native — E16-T01. DESIGN-REF §0.
 *
 * The web keeps these as CSS custom properties and swaps them per theme with a
 * `data-theme` attribute. React Native has no custom properties, so the three
 * themes exist as real objects and the active one is chosen in `lib/theme.ts`.
 *
 * The values are copied from `apps/web/lib/tokens.ts`. `tokens.test.ts` compares
 * the two files and fails when they drift — the alternative is a product whose
 * dark purple differs between the phone and the browser, which nobody notices
 * until both are open side by side.
 */

export interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryFg: string;
  brand: string;
  accentPink: string;
  accentAmber: string;
  accentFg: string;
  danger: string;
  dangerFg: string;
  focus: string;
}

export const THEMES: Record<'light' | 'dark' | 'midnight', ThemeTokens> = {
  light: {
    bg: '#f7f5ff',
    surface: '#ffffff',
    surfaceAlt: '#eae6ff',
    border: '#d9d2f2',
    text: '#1e1240',
    muted: '#514873',
    primary: '#5b3be0',
    primaryFg: '#ffffff',
    brand: '#7c5cfc',
    accentPink: '#ff688a',
    accentAmber: '#ffb84d',
    accentFg: '#1e1240',
    danger: '#b3261e',
    dangerFg: '#ffffff',
    focus: '#5b3be0',
  },
  dark: {
    bg: '#12101f',
    surface: '#1b1830',
    surfaceAlt: '#252140',
    border: '#332d52',
    text: '#edeafb',
    muted: '#b5aed2',
    primary: '#b9a6ff',
    primaryFg: '#12101f',
    brand: '#b9a6ff',
    accentPink: '#ff9fb4',
    accentAmber: '#ffc978',
    accentFg: '#12101f',
    danger: '#ffb4ab',
    dangerFg: '#12101f',
    focus: '#b9a6ff',
  },
  midnight: {
    bg: '#0a0814',
    surface: '#12101f',
    surfaceAlt: '#1b1830',
    border: '#2a2545',
    text: '#e4e0f5',
    muted: '#9f98be',
    primary: '#ae9bf5',
    primaryFg: '#0a0814',
    brand: '#ae9bf5',
    accentPink: '#f58fa6',
    accentAmber: '#f0bd72',
    accentFg: '#0a0814',
    danger: '#f5aaa2',
    dangerFg: '#0a0814',
    focus: '#ae9bf5',
  },
};

/** PRD §23.1 — the floor for anything tappable, in device-independent pixels. */
export const TOUCH_TARGET = 44;

export const RADIUS = { curhat: 16, action: 20, chip: 999 } as const;
export const GUTTER = 20;
