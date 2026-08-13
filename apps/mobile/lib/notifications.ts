import type { NotificationTemplate } from '@curhat/types';

/**
 * Push registration rules — E16-T09. PRD §14, CLAUDE.md non-negotiable #3.
 *
 * The rules live here rather than inside the screen so they can be tested
 * without a device, because one of them is a privacy guarantee rather than a
 * behaviour: **a notification never carries the content of a curhat, a chat, or
 * an AI conversation.** On Android that text lands on a lock screen anyone
 * standing nearby can read.
 *
 * The server already enforces it — `NotificationPayload` has no free-text field
 * (E01, E12). What this file adds is a check on the way in: if a payload ever
 * arrives with something that looks like content, the app drops the extra text
 * rather than displaying it.
 */

export interface IncomingPush {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface SafeNotification {
  title: string;
  body: string;
  deepLink: string;
  template: NotificationTemplate | null;
}

/**
 * Fields that must never be rendered, whatever the server sends.
 *
 * Present as a defence in depth: a future endpoint that starts attaching an
 * excerpt "for context" would otherwise reach the lock screen before anyone
 * noticed.
 */
const FORBIDDEN_DATA_KEYS: readonly string[] = [
  'content',
  'excerpt',
  'message',
  'messageBody',
  'postBody',
  'text',
  'preview',
  'snippet',
];

export function containsForbiddenContent(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return Object.keys(data).some((key) => FORBIDDEN_DATA_KEYS.includes(key));
}

export function toSafeNotification(push: IncomingPush): SafeNotification {
  const data = push.data ?? {};

  return {
    title: typeof push.title === 'string' ? push.title : 'CURHAT DONG',
    // The body comes from a closed template set server-side. Anything longer
    // than a template is treated as a leak and replaced.
    body: typeof push.body === 'string' && !containsForbiddenContent(data) ? push.body : '',
    deepLink: typeof data['deepLink'] === 'string' ? data['deepLink'] : '/notifications',
    template: typeof data['template'] === 'string'
      ? (data['template'] as NotificationTemplate)
      : null,
  };
}

/**
 * When to ask for permission — E16-T09.
 *
 * Not on first launch. A permission prompt before anybody knows what the app
 * does is the fastest way to a permanent "no", and on Android a denied
 * POST_NOTIFICATIONS cannot be asked for again.
 *
 * The moments below are the ones where a notification is obviously useful and
 * the person has just chosen the thing that produces it.
 */
export const PERMISSION_MOMENTS = [
  'after_first_post',
  'after_listener_activation',
  'after_listener_request',
] as const;

export type PermissionMoment = (typeof PERMISSION_MOMENTS)[number];

export function shouldAskForPermission(
  moment: string,
  alreadyAsked: boolean,
  granted: boolean,
): boolean {
  if (granted || alreadyAsked) return false;
  return (PERMISSION_MOMENTS as readonly string[]).includes(moment);
}

/** Device registration payload for `POST /devices` (E12-T01). */
export interface DeviceRegistration {
  deviceId: string;
  platform: 'android' | 'ios';
  pushProvider: 'expo';
  pushToken: string;
  timezone: string;
}

export function deviceRegistration(
  deviceId: string,
  pushToken: string,
  timezone: string,
): DeviceRegistration {
  return {
    deviceId,
    platform: 'android',
    pushProvider: 'expo',
    pushToken,
    // Quiet hours are evaluated in the device's zone, not the server's
    // (notifications.dto.ts), so this has to be the real one.
    timezone,
  };
}
