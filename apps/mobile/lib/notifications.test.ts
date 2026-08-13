import { describe, expect, it } from 'vitest';

import {
  containsForbiddenContent,
  deviceRegistration,
  shouldAskForPermission,
  toSafeNotification,
} from './notifications';

/**
 * Push privacy and permission timing — E16-T09.
 * CLAUDE.md non-negotiable #3, PRD §14.
 */
describe('what a notification is allowed to say', () => {
  it('keeps the generic template text', () => {
    const safe = toSafeNotification({
      title: 'Ada yang membalas curhatmu',
      body: 'Ada seseorang yang membalas curhatmu.',
      data: { deepLink: '/post/1', template: 'response.comment' },
    });

    expect(safe.title).toBe('Ada yang membalas curhatmu');
    expect(safe.body).toBe('Ada seseorang yang membalas curhatmu.');
    expect(safe.deepLink).toBe('/post/1');
  });

  it('drops the body when the payload smuggles content alongside it', () => {
    // The server has no field for this today. If one ever appears, it lands on
    // a lock screen anyone standing nearby can read — so the client refuses it
    // rather than trusting that it never will.
    const safe = toSafeNotification({
      title: 'Ada yang membalas curhatmu',
      body: 'Ada seseorang yang membalas curhatmu.',
      data: { deepLink: '/post/1', excerpt: 'aku capek banget sama semuanya' },
    });

    expect(safe.body).toBe('');
  });

  it('recognises every field name that would carry content', () => {
    for (const key of ['content', 'excerpt', 'message', 'postBody', 'text', 'preview', 'snippet']) {
      expect(containsForbiddenContent({ [key]: 'apa pun' }), key).toBe(true);
    }
    expect(containsForbiddenContent({ deepLink: '/post/1', template: 'response.comment' })).toBe(
      false,
    );
  });

  it('lands somewhere safe when the payload has no deep link', () => {
    expect(toSafeNotification({ title: 'x' }).deepLink).toBe('/notifications');
  });
});

describe('when permission is asked for', () => {
  it('is not on first launch', () => {
    // A prompt before anybody knows what the app does is the fastest way to a
    // permanent no — and on Android POST_NOTIFICATIONS cannot be asked twice.
    expect(shouldAskForPermission('app_start', false, false)).toBe(false);
    expect(shouldAskForPermission('after_first_post', false, false)).toBe(true);
  });

  it('does not ask again once granted or already asked', () => {
    expect(shouldAskForPermission('after_first_post', false, true)).toBe(false);
    expect(shouldAskForPermission('after_first_post', true, false)).toBe(false);
  });
});

describe('device registration', () => {
  it('sends the device timezone, because quiet hours are evaluated there', () => {
    const registration = deviceRegistration('dev-1', 'ExponentPushToken[xxx]', 'Asia/Makassar');

    expect(registration).toMatchObject({
      deviceId: 'dev-1',
      platform: 'android',
      pushProvider: 'expo',
      timezone: 'Asia/Makassar',
    });
  });
});
