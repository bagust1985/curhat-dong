/**
 * Web Push client helpers — E12-T03. PRD §14.
 *
 * The part worth stating out loud is *when* permission is asked for, not how.
 *
 * A browser gives a site exactly one permission prompt. Spend it on the first
 * page load and most people say no — reflexively, before they know what the
 * site is — and the answer is permanent. On a product whose whole premise is
 * that somebody will reply to your curhat, that is not a small loss: the
 * notification is how you find out.
 *
 * So `shouldOfferPush` returns true only after the user has done something
 * that makes a future notification obviously worth having: posted a curhat,
 * asked for a listener, turned on listener availability. The prompt then
 * answers a question they already have — "how will I know?" — instead of
 * interrupting one they have not asked yet.
 */

export type PushMoment = 'posted_curhat' | 'requested_listener' | 'became_available';

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export interface PushSubscriptionPayload {
  deviceId: string;
  platform: 'web';
  pushProvider: 'webpush';
  /** The whole subscription, serialised. The schema stores it opaquely. */
  pushToken: string;
  timezone: string;
}

export function pushSupport(): PushPermissionState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';

  return Notification.permission as PushPermissionState;
}

/**
 * True when this is a good moment to ask.
 *
 * Never re-asks after a refusal: the browser would not show the prompt again
 * anyway, and a UI that keeps offering something it cannot deliver is worse
 * than one that stops.
 */
export function shouldOfferPush(moment: PushMoment): boolean {
  const state = pushSupport();
  if (state !== 'default') return false;

  return (
    moment === 'posted_curhat' ||
    moment === 'requested_listener' ||
    moment === 'became_available'
  );
}

/** Base64url VAPID key → the `Uint8Array` the Push API expects. */
export function decodeVapidKey(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const normalised = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);

  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * A stable per-browser id.
 *
 * Random and stored locally rather than derived from anything about the user:
 * a device id derived from an account would let two installations be linked to
 * the same person, which is the correlation the anonymity model exists to
 * prevent (E04-T04).
 */
export function browserDeviceId(): string {
  const KEY = 'curhat.device_id';
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  localStorage.setItem(KEY, generated);
  return generated;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (pushSupport() === 'unsupported') return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/**
 * Asks for permission and subscribes.
 *
 * Returns null when the user declines or web push is not configured on the
 * server. The caller shows nothing in that case — a refusal is an answer, and
 * the in-app notification list works regardless.
 */
export async function subscribeToPush(
  vapidPublicKey: string | null,
): Promise<PushSubscriptionPayload | null> {
  if (!vapidPublicKey) return null;
  if (pushSupport() === 'unsupported') return null;

  const registration = await registerServiceWorker();
  if (!registration) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(vapidPublicKey) as BufferSource,
  });

  return {
    deviceId: browserDeviceId(),
    platform: 'web',
    pushProvider: 'webpush',
    pushToken: JSON.stringify(subscription.toJSON()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Removes the subscription from the browser.
 *
 * The server row is deleted separately via `DELETE /devices/:id`; doing only
 * one of the two leaves either a browser that keeps receiving or a server that
 * keeps sending into the void.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (pushSupport() === 'unsupported') return false;

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;

  return subscription.unsubscribe();
}
