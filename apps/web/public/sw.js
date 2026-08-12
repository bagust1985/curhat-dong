/**
 * Service worker for Web Push — E12-T03. PRD §14, TECH-SPEC §6.2.
 *
 * Plain JavaScript, served as a static file: a service worker has to be
 * fetched from the origin root scope, and it runs outside the React tree
 * entirely.
 *
 * The one rule that shapes this file: the payload it receives already contains
 * the final, generic copy. There is no template rendering here, no fetching
 * "the rest" of the notification, and no branch that could reach for post
 * content. A notification on a locked laptop screen says the same thing as one
 * on a phone (CLAUDE.md non-negotiable #3).
 */

/* global self, clients */

const FALLBACK = {
  title: 'Curhat Dong',
  body: 'Ada sesuatu yang baru buat kamu.',
  data: { deepLink: '/notifications' },
};

self.addEventListener('install', () => {
  // Take over immediately: waiting for every tab to close means a permission
  // just granted does not work until the user restarts the browser.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = FALLBACK;

  try {
    if (event.data) payload = { ...FALLBACK, ...event.data.json() };
  } catch {
    // A malformed payload still shows the neutral fallback. Showing nothing
    // would leave a browser-visible "site updated in the background" notice on
    // some platforms, which is worse than a plain one of our own.
  }

  const data = payload.data ?? {};

  event.waitUntil(
    self.registration.showNotification(payload.title ?? FALLBACK.title, {
      body: payload.body ?? FALLBACK.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      // Same template collapses rather than stacking: three replies to one
      // curhat is one thing to look at, not three alerts.
      tag: data.template ?? 'curhat-dong',
      renotify: false,
      // Never `requireInteraction`. A notification that will not go away is a
      // demand, and this product does not make demands of people.
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.deepLink ?? '/notifications';

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Focus an open tab rather than opening a second one. Someone reading
      // their curhat should not end up with the app twice.
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }

      await clients.openWindow(target);
    })(),
  );
});

/**
 * The push service can rotate a subscription without the user doing anything.
 * Re-subscribing here and telling the server keeps the device reachable;
 * without this the notifications simply stop, silently.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
      if (!applicationServerKey) return;

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // The page holds the access token, not the worker, so it does the call.
      clientList[0]?.postMessage({
        type: 'push-subscription-changed',
        subscription: subscription.toJSON(),
      });
    })(),
  );
});
