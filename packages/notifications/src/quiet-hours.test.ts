import { describe, expect, it } from 'vitest';

import {
  decideQuietHours,
  isWithinWindow,
  localHourIn,
  nextDeliveryTime,
  type NotificationCategory,
} from './quiet-hours.js';

const base = { startHour: 22, endHour: 7, enabled: true } as const;

describe('window arithmetic', () => {
  it('handles a window that wraps past midnight', () => {
    // 22:00–07:00 is the default. Treating it as a normal range would silence
    // notifications all day instead of all night.
    for (const hour of [22, 23, 0, 3, 6]) {
      expect(isWithinWindow(hour, 22, 7)).toBe(true);
    }
    for (const hour of [7, 12, 18, 21]) {
      expect(isWithinWindow(hour, 22, 7)).toBe(false);
    }
  });

  it('handles a window that does not wrap', () => {
    expect(isWithinWindow(10, 9, 17)).toBe(true);
    expect(isWithinWindow(8, 9, 17)).toBe(false);
    expect(isWithinWindow(17, 9, 17)).toBe(false);
  });

  it('treats an empty window as always open', () => {
    expect(isWithinWindow(3, 22, 22)).toBe(false);
  });
});

describe('quiet hours decision (PRD §14)', () => {
  it('holds social and listener notifications at night', () => {
    for (const category of ['social', 'response', 'listener', 'ai'] as NotificationCategory[]) {
      expect(decideQuietHours({ ...base, category, localHour: 2 })).toBe('hold');
    }
  });

  it('always sends safety and account notifications', () => {
    // Someone needs to know their appeal was decided, or that action was taken
    // on their account, regardless of the hour.
    for (const category of ['safety', 'account'] as NotificationCategory[]) {
      expect(decideQuietHours({ ...base, category, localHour: 2 })).toBe('send');
    }
  });

  it('does not exempt listener nudges', () => {
    // A nudge at 02:00 is the fastest way to lose a listener, and it is not
    // safety-critical — the requester is already offered DONG AI.
    expect(decideQuietHours({ ...base, category: 'listener', localHour: 2 })).toBe('hold');
  });

  it('sends everything during the day', () => {
    expect(decideQuietHours({ ...base, category: 'social', localHour: 14 })).toBe('send');
  });

  it('drops perishable notifications rather than delivering them stale', () => {
    // A match offer with a 60s TTL delivered six hours later is worse than
    // silence.
    expect(
      decideQuietHours({ ...base, category: 'listener', localHour: 2, perishable: true }),
    ).toBe('drop');
  });

  it('respects a user switching quiet hours off', () => {
    expect(
      decideQuietHours({ ...base, enabled: false, category: 'social', localHour: 3 }),
    ).toBe('send');
  });

  it('respects a custom window', () => {
    expect(
      decideQuietHours({ ...base, startHour: 23, endHour: 5, category: 'social', localHour: 22 }),
    ).toBe('send');
    expect(
      decideQuietHours({ ...base, startHour: 23, endHour: 5, category: 'social', localHour: 23 }),
    ).toBe('hold');
  });
});

describe('timezone handling', () => {
  it('reads the local hour for a zone', () => {
    // 2026-08-12T20:00:00Z is 03:00 on the 13th in Jakarta (UTC+7).
    const at = new Date('2026-08-12T20:00:00Z');
    expect(localHourIn('Asia/Jakarta', at)).toBe(3);
    expect(localHourIn('UTC', at)).toBe(20);
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    const at = new Date('2026-08-12T20:00:00Z');
    expect(localHourIn('Bukan/Zona', at)).toBe(20);
  });

  it('holds a notification for a Jakarta user who is asleep while UTC is awake', () => {
    // The whole point of storing a timezone: 20:00 UTC is the middle of the
    // night in Jakarta, and the server's clock must not decide this.
    const at = new Date('2026-08-12T20:00:00Z');
    expect(
      decideQuietHours({
        ...base,
        category: 'social',
        localHour: localHourIn('Asia/Jakarta', at),
      }),
    ).toBe('hold');
  });
});

describe('deferred delivery', () => {
  it('schedules for the end of the window', () => {
    const now = new Date('2026-08-12T02:00:00');
    const next = nextDeliveryTime(7, now);
    expect(next.getHours()).toBe(7);
    expect(next.getDate()).toBe(12);
  });

  it('rolls to the next day when the window already ended today', () => {
    const now = new Date('2026-08-12T23:00:00');
    const next = nextDeliveryTime(7, now);
    expect(next.getDate()).toBe(13);
  });
});
