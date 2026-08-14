/**
 * Design tokens — E15-T01, repainted rose in E18-T01. DESIGN-REF §0, PRD §23,
 * §23.1.
 *
 * Mirrored from `globals.css` so the contrast test can assert them. If a colour
 * changes in CSS it must change here too; the test is what keeps the two
 * honest, because accessibility here is an acceptance criterion rather than a
 * review note.
 *
 * ## Where these values come from
 *
 * The app icon in `docs/curhatdong_logo_v2.png`: a rose ground, a periwinkle
 * speech bubble, a pink heart, amber and coral sparks. The previous palette was
 * lavender-led and had drifted away from the mark it was supposed to belong to
 * — pink survived in exactly two places in the whole app.
 *
 * ## The one rule the palette rests on
 *
 * **Deep rose carries the actions, bright pink carries the identity.** Not a
 * style preference — bright pink physically cannot hold white text:
 *
 *  - white on the logo pink `#FA4B7D` is **3.30:1**, under the 4.5 that normal
 *    text needs. So `primary` is the deeper `#C2185B` (white on it: 5.87:1) and
 *    the logo pink lives on as `brand` for large type, icons, outlines and
 *    badges, where 3:1 is the bar and it clears it at 3.09:1 against the ground;
 *  - where `brand` is used as a *fill* it takes dark ink, never white:
 *    `#2B1233` on `#FA4B7D` is 5.15:1.
 *
 * This is the same split the lavender palette used (`primary` #5B3BE0 deep,
 * `brand` #7C5CFC bright) — only the hue family changed.
 *
 * ## Why `danger` is burnt brick and not red
 *
 * With a magenta-rose primary, the old `#B3261E` sat 11° of hue away from it:
 * "Hapus" became a near-twin of "Kirim", which is the kind of resemblance that
 * gets things deleted by accident. `#7E2F0C` is 42° away and clearly darker.
 * Red stays reserved for destructive actions and nothing else.
 *
 * ## Why rose and lavender, given DESIGN-REF §0
 *
 * §0 warns against dating-app connotations, and pink-purple is that palette's
 * home. What keeps this on the right side: pink sits on the acts of *telling* —
 * the composer, the curhat card, felt-heard — and never on hearts, matches or
 * profiles; the ground is a pale blush rather than a saturated pink; and there
 * is no swipe, no match, no rating anywhere in the product to reinforce the
 * reading. Lavender drops to a supporting role for DONG AI and system actions.
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
  /**
   * The logo pink. Large type, icons, outlines and badges (3:1 uses), or a fill
   * that takes `accentFg`. It never carries `primaryFg`.
   */
  brand: string;
  /** The supporting hue: DONG AI and system actions. */
  accentLavender: string;
  accentAmber: string;
  /** Ink that is legible on brand pink and amber. */
  accentFg: string;
  /**
   * Soft fills that tint a surface without becoming a second brand colour —
   * the quick-link tiles, the AI card, chip grounds. All hold `text` at AA.
   */
  tintPink: string;
  tintLavender: string;
  tintAmber: string;
  tintRose: string;
  /** The only red in the system, and only for destructive actions. */
  danger: string;
  dangerFg: string;
  /** Focus ring. Must be visible on every surface (PRD §23.1). */
  focus: string;
}

export const THEMES: Readonly<Record<ThemeName, ThemeTokens>> = {
  light: {
    // "Pagi Merah Muda". The ground is a warm rose off-white rather than plain
    // white: this is a room somebody sits in, and a sterile ground is the
    // hospital §0 rules out. The neutrals carry a red bias for the same reason
    // — a pure grey beside this much pink reads as an accident.
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
    // "Malam Plum" — a warm plum-black rather than the blue-purple it used to
    // be, so night keeps the same temperature as day instead of switching
    // families after sunset.
    bg: '#1a1020',
    surface: '#251729',
    surfaceAlt: '#33203a',
    border: '#4a2c46',
    text: '#f7e9f0',
    muted: '#c9a9bb',
    // Inverted on dark: a light rose fill with dark ink, because a saturated
    // rose button on a dark ground cannot carry white text at AA.
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
    // Pushed towards coral rather than kept red: on a dark ground the light
    // rose primary and a light red are nearly the same colour, and 40° of hue
    // is what keeps "Hapus" from looking like "Kirim".
    danger: '#ff9d80',
    dangerFg: '#1a1020',
    focus: '#ff86bb',
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
  /**
   * Cards, sheets, modals. Raised to 20px in E18-T01 — the top of §0's 16–20px
   * range rather than the bottom, because the feed card is where "this has room
   * to breathe" is actually felt.
   */
  lg: '1.25rem',
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
