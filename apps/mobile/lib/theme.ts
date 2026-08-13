import { THEMES, type ThemeTokens } from './tokens';

/**
 * Theme selection — E16-T01, E16-T10. DESIGN-REF §0.
 *
 * Same precedence as the web (`ThemeScript`): an explicit choice wins, then
 * Midnight Mode between 21:00 and 04:00, then the OS setting.
 *
 * Midnight is not a preference the user picks. It is what the app looks like at
 * the hour it is most used, and putting it behind a toggle would mean almost
 * nobody sees the version designed for the time they actually open it.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark' | 'midnight';

export const MIDNIGHT_START_HOUR = 21;
export const MIDNIGHT_END_HOUR = 4;

export function isMidnightHour(now: Date): boolean {
  const hour = now.getHours();
  return hour >= MIDNIGHT_START_HOUR || hour < MIDNIGHT_END_HOUR;
}

export function resolveTheme(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null,
  now: Date,
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  if (isMidnightHour(now)) return 'midnight';
  return systemScheme === 'light' ? 'light' : 'dark';
}

export function tokensFor(theme: ResolvedTheme): ThemeTokens {
  return THEMES[theme];
}

/** DESIGN-REF §2.4, quoted exactly — the same sentence the web shows. */
export const MIDNIGHT_GREETING = 'Belum tidur? Kalau ada yang mau diceritain, gue di sini.';
export const DAY_GREETING = 'Ada yang mau diceritain hari ini?';

export function feedGreeting(now: Date): string {
  return isMidnightHour(now) ? MIDNIGHT_GREETING : DAY_GREETING;
}
