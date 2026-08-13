/**
 * Design tokens — E15-T01. DESIGN-REF §0, PRD §23, §23.1.
 *
 * Mirrored from `globals.css` so the contrast test can assert them. If a colour
 * changes in CSS it must change here too; the test is what keeps the two
 * honest, because accessibility here is an acceptance criterion rather than a
 * review note.
 *
 * ## Where these values come from
 *
 * The brand kit in `docs/` is the source of identity: purple `#7C5CFC`, pink
 * `#FF688A`, amber `#FFB84D`, lavender `#EAE6FF`, and the near-white ground.
 * The values below are those hues *tuned until they pass WCGA AA* — which two
 * of them did not, and that is worth stating rather than hiding:
 *
 *  - white on brand purple `#7C5CFC` is **4.38:1** — under the 4.5 needed for
 *    normal text, though fine for large text and UI borders (3:1). The mock's
 *    primary button uses exactly that pairing, so `primary` here is deepened to
 *    `#5B3BE0` (6.67:1) for anything text sits on, and the brand purple is kept
 *    as `brand` for large type, icons and outlines;
 *  - white on brand pink `#FF688A` is **2.76:1**, which fails badly. Pink
 *    therefore never carries white text: it is decoration, or it takes dark ink
 *    (`#1E1240` on pink is 6.25:1).
 *
 * ## Why pink and purple, given DESIGN-REF §0
 *
 * §0 warns against dating-app connotations, and purple-pink is that palette's
 * home. Two things keep it on the right side: pink appears as brand punctuation
 * and warmth rather than on hearts, matches or profiles, and the ground stays
 * lavender-neutral rather than saturated. `danger` is the only red.
 */

export type ThemeName = 'light' | 'dark' | 'midnight';

export interface ThemeTokens {
  /** Page ground. */
  bg: string;
  /** Cards, sheets, inputs. */
  surface: string;
  /** A second surface for nesting, so depth does not need shadows. */
  surfaceAlt: string;
  /** Hairlines. Non-text, so 3:1 is not required — but must be visible. */
  border: string;
  /** Body text. */
  text: string;
  /** Secondary text. Still held to 4.5:1 — "muted" is not "unreadable". */
  muted: string;
  /** Fill for primary actions. Text on it is `primaryFg`. */
  primary: string;
  primaryFg: string;
  /** Brand purple, for large type, icons and outlines (3:1 uses only). */
  brand: string;
  /** Warm punctuation. Never carries `primaryFg`. */
  accentPink: string;
  accentAmber: string;
  /** Ink that is legible on pink and amber. */
  accentFg: string;
  /** The only red in the system, and only for destructive actions. */
  danger: string;
  dangerFg: string;
  /** Focus ring. Must be visible on every surface (PRD §23.1). */
  focus: string;
}

export const THEMES: Readonly<Record<ThemeName, ThemeTokens>> = {
  light: {
    // The brand kit's near-white ground. Its swatch is labelled `#F755FF`,
    // which is bright magenta and cannot be what the artwork shows — the
    // rendered chip is almost white. Read as `#F7F5FF`, a one-character
    // transposition, which matches both the image and the lavender family.
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
    // Deep purple-black rather than neutral charcoal, so the dark theme still
    // reads as this product and not as a generic dark mode.
    bg: '#12101f',
    surface: '#1b1830',
    surfaceAlt: '#252140',
    border: '#332d52',
    text: '#edeafb',
    muted: '#b5aed2',
    // Inverted on dark: a light purple fill with dark ink, because a saturated
    // purple button on a dark ground cannot carry white text at AA.
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
  /**
   * Midnight Mode — DESIGN-REF §0, active 21.00–04.00.
   *
   * Dimmer than `dark`, not a different palette. Somebody opening this at 2am
   * chose to; the job is to be quiet, not to be a different product. Contrast
   * is still held to AA — dimming the text instead of the ground is how a night
   * theme quietly becomes unreadable.
   */
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

/**
 * Shape and spacing — DESIGN-REF §0.
 *
 * Radii are generous (16–20px) and spacing is loose because the alternative
 * reads as dense and administrative. A product people open when they feel bad
 * should not look like a form.
 */
export const RADII = {
  sm: '0.5rem',
  md: '0.75rem',
  /** Cards, sheets, modals — the 16px the design direction asks for. */
  lg: '1rem',
  /** Primary buttons and the FAB — full pills since Revisi 2 (brand mock). */
  xl: '999px',
  full: '9999px',
} as const;

export const SPACING = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
} as const;

/**
 * Nunito, from the brand kit.
 *
 * A rounded sans, which is the point: the geometric sans every SaaS dashboard
 * uses would make this feel like software rather than somewhere to talk.
 */
export const FONT_STACK =
  "var(--font-nunito), 'Nunito', ui-rounded, 'Segoe UI', system-ui, -apple-system, sans-serif";

/**
 * The smallest interactive box — PRD §23.1.
 *
 * 44px, and it applies to the reaction buttons too. Six small taps in a row is
 * exactly where a minimum target stops being theoretical.
 */
export const MIN_TOUCH_TARGET_PX = 44;

/** Midnight Mode window, matching `ui.midnight_mode_*` in app_configs. */
export const MIDNIGHT_WINDOW = { startHour: 21, endHour: 4 } as const;

/** True when a local hour falls inside the Midnight Mode window. */
export function isMidnightHour(hour: number): boolean {
  return hour >= MIDNIGHT_WINDOW.startHour || hour < MIDNIGHT_WINDOW.endHour;
}

/**
 * Which theme applies at a given local hour.
 *
 * Midnight Mode only ever *replaces dark* — a user who chose light keeps light.
 * Dimming somebody's screen because of the clock, against a preference they
 * set, is the app deciding it knows better.
 */
export function themeForHour(preference: 'light' | 'dark' | 'system', hour: number, systemPrefersDark = false): ThemeName {
  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

  if (resolved === 'light') return 'light';

  return isMidnightHour(hour) ? 'midnight' : 'dark';
}
