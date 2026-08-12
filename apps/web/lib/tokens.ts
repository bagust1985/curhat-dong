/**
 * The token values from globals.css, mirrored here so they can be asserted in
 * a test. If a colour changes in CSS it must change here too — the contrast
 * test is what keeps the two honest.
 */

export type ThemeName = 'light' | 'dark' | 'midnight';

export interface ThemeTokens {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentFg: string;
  danger: string;
}

export const THEMES: Readonly<Record<ThemeName, ThemeTokens>> = {
  light: {
    bg: '#fbf9f7',
    surface: '#ffffff',
    border: '#e6e1db',
    text: '#1a1f2b',
    muted: '#5a6478',
    accent: '#8a4a00',
    accentFg: '#ffffff',
    danger: '#a32323',
  },
  dark: {
    bg: '#0f1420',
    surface: '#171e2e',
    border: '#263049',
    text: '#e8eaf0',
    muted: '#a3acc2',
    accent: '#f5b971',
    accentFg: '#2a1d0a',
    danger: '#f08a8a',
  },
  midnight: {
    bg: '#080b12',
    surface: '#0f1420',
    border: '#1c2437',
    text: '#dce0ea',
    muted: '#98a1b8',
    accent: '#e0a867',
    accentFg: '#211705',
    danger: '#e88080',
  },
};

/** Midnight Mode window — DESIGN-REF §0. */
export const MIDNIGHT_START_HOUR = 21;
export const MIDNIGHT_END_HOUR = 4;

export function isMidnightHour(hour: number): boolean {
  return hour >= MIDNIGHT_START_HOUR || hour < MIDNIGHT_END_HOUR;
}
