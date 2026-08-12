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

export type NotificationCategory =
  | 'social'
  | 'response'
  | 'listener'
  | 'ai'
  | 'safety'
  | 'account';

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

/** Local hour for an IANA timezone. Falls back to UTC on a bad zone. */
export function localHourIn(timezone: string, now: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now);
    const hour = Number.parseInt(formatted, 10);
    return Number.isNaN(hour) ? now.getUTCHours() : hour % 24;
  } catch {
    return now.getUTCHours();
  }
}

/** When a held notification may be sent. */
export function nextDeliveryTime(endHour: number, now: Date = new Date()): Date {
  const next = new Date(now);
  next.setHours(endHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}
