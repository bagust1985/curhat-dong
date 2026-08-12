import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeVapidKey, pushSupport, shouldOfferPush } from './push.js';

const serviceWorker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Minimal browser surface: enough for the permission logic to run. */
function stubBrowser(permission: NotificationPermission): void {
  const notification = { permission };
  vi.stubGlobal('window', { PushManager: class {}, Notification: notification });
  vi.stubGlobal('navigator', { serviceWorker: {} });
  vi.stubGlobal('Notification', notification);
}

describe('push permission timing (E12-T03)', () => {
  it('reports unsupported outside a browser', () => {
    expect(pushSupport()).toBe('unsupported');
    expect(shouldOfferPush('posted_curhat')).toBe(false);
  });

  it('offers after a meaningful action, not on first load', () => {
    stubBrowser('default');

    // A browser grants one prompt ever. Spent on page load it is usually spent
    // on a "no" — and on this product the notification is how someone finds
    // out they were answered.
    expect(shouldOfferPush('posted_curhat')).toBe(true);
    expect(shouldOfferPush('requested_listener')).toBe(true);
    expect(shouldOfferPush('became_available')).toBe(true);
  });

  it('never re-asks after a refusal', () => {
    stubBrowser('denied');
    expect(shouldOfferPush('posted_curhat')).toBe(false);
  });

  it('does not ask again once granted', () => {
    stubBrowser('granted');
    expect(shouldOfferPush('posted_curhat')).toBe(false);
  });
});

describe('VAPID key decoding', () => {
  it('round-trips a base64url key of the length the Push API expects', () => {
    const key = Buffer.alloc(65, 7);
    const encoded = key.toString('base64url');

    const decoded = decodeVapidKey(encoded);

    expect(decoded).toHaveLength(65);
    expect(Buffer.from(decoded).equals(key)).toBe(true);
  });
});

describe('service worker (non-negotiable #3)', () => {
  it('renders only what the payload already contains', () => {
    // No template assembly, no follow-up fetch: whatever reaches the lock
    // screen was built server-side from the closed catalogue.
    expect(serviceWorker).not.toMatch(/fetch\s*\(/);
    expect(serviceWorker).toContain('payload.body');
  });

  it('shows a neutral fallback rather than nothing when a payload is unreadable', () => {
    expect(serviceWorker).toContain('Ada sesuatu yang baru buat kamu.');
  });

  it('never pins a notification on screen', () => {
    // `requireInteraction` makes a notification stay until dismissed. On a
    // product for people having a hard time, that is a demand.
    expect(serviceWorker).not.toMatch(/requireInteraction:\s*true/);
  });

  it('follows the deep link the server built', () => {
    expect(serviceWorker).toContain('deepLink');
  });
});
