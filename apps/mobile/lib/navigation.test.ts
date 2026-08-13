import { describe, expect, it } from 'vitest';

import { NOTIFICATION_FALLBACK, TABS, isBackGuarded, resolveDeepLink } from './navigation';
import { DAY_GREETING, MIDNIGHT_GREETING, feedGreeting, isMidnightHour, resolveTheme } from './theme';
import { THEMES } from './tokens';

/**
 * Navigation, deep links and theme — E16-T02, E16-T09.
 */
describe('deep links from a notification', () => {
  it('follows the paths the product actually has', () => {
    expect(resolveDeepLink('/post/abc')).toBe('/post/abc');
    expect(resolveDeepLink('/room/xyz')).toBe('/room/xyz');
    expect(resolveDeepLink('/notifications')).toBe('/notifications');
  });

  it('refuses anything that could steer the app somewhere else', () => {
    // A payload arriving from outside the app must not choose the destination.
    for (const hostile of [
      'https://contoh.test/phish',
      '//contoh.test',
      '/settings/../../secret',
      'curhatdong://post/1',
      '',
      null,
      undefined,
    ]) {
      expect(resolveDeepLink(hostile), String(hostile)).toBe(NOTIFICATION_FALLBACK);
    }
  });

  it('falls back somewhere useful rather than nowhere', () => {
    expect(resolveDeepLink('/rute-yang-nggak-ada')).toBe('/notifications');
  });
});

describe('android back', () => {
  it('guards the flows where leaving loses what was typed', () => {
    expect(isBackGuarded('/onboarding')).toBe(true);
    expect(isBackGuarded('/curhat/baru')).toBe(true);
    expect(isBackGuarded('/room/abc')).toBe(true);
    // The feed is the root: backing out there is meant to leave the app.
    expect(isBackGuarded('/')).toBe(false);
    expect(isBackGuarded('/explore')).toBe(false);
  });
});

describe('tabs', () => {
  it('is the five-slot layout from DESIGN-REF §1', () => {
    expect(TABS.map((tab) => tab.key)).toEqual(['home', 'explore', 'listen', 'profile']);
    // The fifth slot is the floating "+ Curhat", which is not a tab.
  });
});

describe('theme', () => {
  it('turns to midnight between 21:00 and 04:00 whatever the OS says', () => {
    expect(resolveTheme('system', 'light', new Date('2026-08-12T22:00:00'))).toBe('midnight');
    expect(resolveTheme('system', 'dark', new Date('2026-08-12T02:00:00'))).toBe('midnight');
    expect(resolveTheme('system', 'light', new Date('2026-08-12T13:00:00'))).toBe('light');
  });

  it('lets an explicit choice win over the hour', () => {
    // Somebody who picked light at 2am meant it.
    expect(resolveTheme('light', 'dark', new Date('2026-08-12T02:00:00'))).toBe('light');
  });

  it('defaults to dark when the OS preference is unknown', () => {
    // Peak usage is at night, and `useColorScheme` can return nothing at all.
    expect(resolveTheme('system', null, new Date('2026-08-12T13:00:00'))).toBe('dark');
  });

  it('greets differently at night', () => {
    expect(feedGreeting(new Date('2026-08-12T23:00:00'))).toBe(MIDNIGHT_GREETING);
    expect(feedGreeting(new Date('2026-08-12T09:00:00'))).toBe(DAY_GREETING);
    expect(isMidnightHour(new Date('2026-08-12T20:59:00'))).toBe(false);
  });

  it('carries all three palettes, midnight included', () => {
    expect(Object.keys(THEMES)).toEqual(['light', 'dark', 'midnight']);
  });
});
