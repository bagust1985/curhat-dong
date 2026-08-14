/**
 * Design tokens for React Native — E16-T01, repainted rose in E18-T05.
 * DESIGN-REF §0.
 *
 * The web keeps these as CSS custom properties and swaps them per theme with a
 * `data-theme` attribute. React Native has no custom properties, so the three
 * themes exist as real objects and the active one is chosen in `lib/theme.ts`.
 *
 * The values are copied from `apps/web/lib/tokens.ts`, and `tokens.test.ts`
 * reads that file and fails when the two drift. That test is new: this comment
 * used to claim it existed while the file did not, which is how the web could
 * move to a rose palette and leave the phone on lavender with a green suite —
 * a safety net that lives only in a comment is worse than none, because people
 * trust it.
 *
 * The rule the palette rests on, unchanged from the web: deep rose carries the
 * actions, bright pink carries the identity. White on the logo pink is 3.30:1,
 * so `brand` can never be a button fill.
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
  /** The logo pink. Large type, icons and outlines, or a fill taking `accentFg`. */
  brand: string;
  /** DONG AI and system actions. */
  accentLavender: string;
  accentAmber: string;
  accentFg: string;
  /** Soft fills that tint a surface without becoming a second brand colour. */
  tintPink: string;
  tintLavender: string;
  tintAmber: string;
  tintRose: string;
  danger: string;
  dangerFg: string;
  focus: string;
}

export const THEMES: Record<'light' | 'dark' | 'midnight', ThemeTokens> = {
  light: {
    bg: '#fff5f8',
    surface: '#ffffff',
    surfaceAlt: '#ffe6ee',
    border: '#f4cfdd',
    text: '#2b1233',
    muted: '#6b4257',
    primary: '#c2185b',
    primaryFg: '#ffffff',
    brand: '#fa4b7d',
    accentLavender: '#6d4ae0',
    accentAmber: '#ffb020',
    accentFg: '#2b1233',
    tintPink: '#ffdce7',
    tintLavender: '#e9e1ff',
    tintAmber: '#ffebcb',
    tintRose: '#ffd3e1',
    danger: '#7e2f0c',
    dangerFg: '#ffffff',
    focus: '#c2185b',
  },
  dark: {
    bg: '#1a1020',
    surface: '#251729',
    surfaceAlt: '#33203a',
    border: '#4a2c46',
    text: '#f7e9f0',
    muted: '#c9a9bb',
    primary: '#ff86bb',
    primaryFg: '#1a1020',
    brand: '#ff9fca',
    accentLavender: '#c4b0ff',
    accentAmber: '#ffc978',
    accentFg: '#1a1020',
    tintPink: '#3d2138',
    tintLavender: '#2f2650',
    tintAmber: '#3d3020',
    tintRose: '#452133',
    danger: '#ff9d80',
    dangerFg: '#1a1020',
    focus: '#ff86bb',
  },
  midnight: {
    bg: '#120a16',
    surface: '#1a1020',
    surfaceAlt: '#251729',
    border: '#3a2340',
    text: '#efdde7',
    muted: '#b898aa',
    primary: '#f582b4',
    primaryFg: '#120a16',
    brand: '#f596c2',
    accentLavender: '#b7a2f5',
    accentAmber: '#f0bd72',
    accentFg: '#120a16',
    tintPink: '#301a2c',
    tintLavender: '#251d40',
    tintAmber: '#302618',
    tintRose: '#361a28',
    danger: '#f0977c',
    dangerFg: '#120a16',
    focus: '#f582b4',
  },
};

/** PRD §23.1 — the floor for anything tappable, in device-independent pixels. */
export const TOUCH_TARGET = 44;

/**
 * Shape, matching `RADII` on the web.
 *
 * `curhat` is 20px (the top of DESIGN-REF §0's 16–20px) and `action` is a full
 * pill, both since E18-T01. They were 16 and 20 here, which meant a card and a
 * button were subtly the wrong shape on the phone against the same screen in a
 * browser.
 */
export const RADIUS = { curhat: 20, action: 999, chip: 999 } as const;
export const GUTTER = 20;
