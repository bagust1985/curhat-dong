/**
 * Midnight Mode — E15-T08. DESIGN-REF §0, §2.4.
 *
 * 21:00–04:00 is when this product is used most, and the copy changes with it:
 * a cheerful daytime greeting at 2am reads as a machine that has not noticed
 * what time it is.
 *
 * The theme swap itself happens before first paint in `ThemeScript`. This is
 * only about words, and takes `now` as an argument for the same reason the
 * relative-time helper does.
 */

export const MIDNIGHT_START_HOUR = 21;
export const MIDNIGHT_END_HOUR = 4;

export function isMidnightHour(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= MIDNIGHT_START_HOUR || hour < MIDNIGHT_END_HOUR;
}

/** DESIGN-REF §2.4, quoted exactly. */
export const MIDNIGHT_GREETING = 'Belum tidur? Kalau ada yang mau diceritain, gue di sini.';

export const DAY_GREETING = 'Ada yang mau diceritain hari ini?';

export function feedGreeting(now: Date = new Date()): string {
  return isMidnightHour(now) ? MIDNIGHT_GREETING : DAY_GREETING;
}
