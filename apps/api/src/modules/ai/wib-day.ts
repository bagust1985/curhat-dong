/**
 * Daily boundaries in WIB (UTC+7) — E08-T06, E08-T07.
 *
 * Budget and quota reset at local midnight, not UTC midnight. On UTC the reset
 * would land at 07:00 in Jakarta, in the middle of the morning — a user who
 * ran out at 23:00 would get nothing back until after breakfast.
 *
 * WIB has no daylight saving and has been a fixed offset since 1964, so a
 * constant offset is correct here rather than merely convenient.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the WIB day containing `at`. Used as a counter key. */
export function wibDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant at which the current WIB day started. */
export function wibDayStart(at: Date = new Date()): Date {
  const shifted = at.getTime() + WIB_OFFSET_MS;
  const startOfShiftedDay = shifted - (shifted % 86_400_000);
  return new Date(startOfShiftedDay - WIB_OFFSET_MS);
}

/** Seconds remaining in the current WIB day, for counter expiry. */
export function secondsUntilWibMidnight(at: Date = new Date()): number {
  const nextStart = wibDayStart(at).getTime() + 86_400_000;
  return Math.max(60, Math.ceil((nextStart - at.getTime()) / 1000));
}
