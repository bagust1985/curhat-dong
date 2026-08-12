/**
 * Quiet hours — PRD §14.
 *
 * Default 22:00–07:00 local time. Non-safety notifications are held until the
 * window ends, or dropped when they will be stale by then.
 *
 * The product opens itself to people at 2am; it must not *wake* them at 2am.
 * Midnight Mode assumes the user chose to open the app — a push notification
 * makes that choice for them, which is the opposite thing.
 */

import type { NotificationCategory } from './templates.js';

export type { NotificationCategory };

/**
 * Categories that ignore quiet hours.
 *
 * Deliberately short. Listener nudges and social notifications are exactly the
 * ones that feel urgent to the product and are not urgent to the person
 * asleep.
 */
const QUIET_HOURS_EXEMPT: readonly NotificationCategory[] = ['safety', 'account'];

export type QuietHoursDecision = 'send' | 'hold' | 'drop';

export interface QuietHoursInput {
  category: NotificationCategory;
  /** Local hour at the recipient, 0–23. */
  localHour: number;
  startHour: number;
  endHour: number;
  enabled: boolean;
  /**
   * True when the notification stops being useful once the window ends —
   * a listener match offer with a 60s TTL, for example.
   */
  perishable?: boolean;
}

/**
 * True when `hour` falls inside a window that may wrap past midnight.
 *
 * 22→07 wraps; 09→17 does not. Getting this wrong silences notifications all
 * day instead of all night, which is the kind of bug nobody reports because it
 * looks like the feature simply not working.
 */
export function isWithinWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

export function decideQuietHours(input: QuietHoursInput): QuietHoursDecision {
  if (!input.enabled) return 'send';
  if (QUIET_HOURS_EXEMPT.includes(input.category)) return 'send';

  const quiet = isWithinWindow(input.localHour, input.startHour, input.endHour);
  if (!quiet) return 'send';

  // Held notifications are delivered when the window ends. Perishable ones are
  // dropped instead — delivering a match offer that expired six hours ago is
  // worse than staying quiet.
  return input.perishable ? 'drop' : 'hold';
}

/** Local wall-clock time in an IANA timezone. Falls back to UTC on a bad zone. */
export function localTimeIn(
  timezone: string,
  now: Date = new Date(),
): { hour: number; minute: number } {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    const [hourPart, minutePart] = formatted.split(':');
    const hour = Number.parseInt(hourPart ?? '', 10);
    const minute = Number.parseInt(minutePart ?? '', 10);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
    }
    return { hour: hour % 24, minute };
  } catch {
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

/** Local hour for an IANA timezone. Falls back to UTC on a bad zone. */
export function localHourIn(timezone: string, now: Date = new Date()): number {
  return localTimeIn(timezone, now).hour;
}

/**
 * When a held notification may be sent, as an absolute instant.
 *
 * Computed by stepping forward from *the recipient's* local clock, not the
 * server's. A server in UTC calling `setHours(7)` would release Jakarta's held
 * notifications at 14:00 local — the middle of the afternoon, hours after the
 * moment the window was supposed to open.
 */
export function nextDeliveryTime(
  endHour: number,
  timezone: string,
  now: Date = new Date(),
): Date {
  const { hour, minute } = localTimeIn(timezone, now);

  let hoursAhead = endHour - hour;
  if (hoursAhead <= 0) hoursAhead += 24;

  const target = new Date(now.getTime() + hoursAhead * 3_600_000);
  // Trim back to the top of the hour so delivery lands at exactly endHour:00
  // local rather than at whatever minute the notification happened to arrive.
  target.setUTCMinutes(target.getUTCMinutes() - minute, 0, 0);
  return target;
}
