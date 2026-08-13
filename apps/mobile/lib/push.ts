import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { api } from './api';
import {
  deviceRegistration,
  shouldAskForPermission,
  toSafeNotification,
  type SafeNotification,
} from './notifications';

/**
 * Push registration — E16-T09. PRD §14, CLAUDE.md non-negotiable #3.
 *
 * The privacy rules live in `notifications.ts` (pure, tested). This file is the
 * device side: permission, token, registration, and turning a tap into a route.
 *
 * Two things are deliberate:
 *
 *  - **permission is never requested on launch.** `shouldAskForPermission`
 *    decides, and it only says yes after the person has done something that
 *    produces notifications. On Android a denied POST_NOTIFICATIONS cannot be
 *    asked for a second time, so a prompt shown too early is permanent;
 *  - **the device id is generated once and kept**, because the API upserts on
 *    `(userId, deviceId)`. A fresh id per launch would leave a trail of dead
 *    device rows, each one a push token that no longer works.
 */

const DEVICE_ID_KEY = 'curhat.device_id';
const ASKED_KEY = 'curhat.push_asked';

/**
 * Foreground behaviour.
 *
 * The banner is shown, but the *content* still comes from the server's closed
 * template set — this only decides whether a notification is surfaced while the
 * app is open, not what it says.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function deviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  // Long enough for the API's `min(8)`, and random rather than derived from
  // anything about the phone or the person.
  const generated = `and-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

export async function hasAskedBefore(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED_KEY)) === 'true';
}

export async function permissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Asks, registers, and returns whether push is now working.
 *
 * Called at a moment (`shouldAskForPermission`), never on launch. Failure is
 * quiet: push is a convenience, and an error dialog about it in the middle of
 * posting a curhat would be worse than not having push.
 */
export async function enablePush(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;

    if (status !== 'granted') {
      await AsyncStorage.setItem(ASKED_KEY, 'true');
      status = (await Notifications.requestPermissionsAsync()).status;
    }

    if (status !== 'granted') return false;

    const projectId =
      (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId ||
      undefined;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await api('/devices', {
      method: 'POST',
      body: deviceRegistration(
        await deviceId(),
        token.data,
        // Quiet hours are evaluated in the device's zone, not the server's
        // (notifications.dto.ts), so this has to be the real one.
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
      ),
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Re-registers when the provider rotates the token.
 *
 * Expo can issue a new token after an app update or a restore to a new device.
 * Without this the account keeps pushing to a token nobody is listening on.
 */
export function onTokenChange(handler: () => void): () => void {
  const subscription = Notifications.addPushTokenListener(() => handler());
  return () => subscription.remove();
}

/** Turns a tapped notification into the payload the router can act on. */
export function safeNotificationFrom(
  response: Notifications.NotificationResponse,
): SafeNotification {
  const content = response.notification.request.content;
  return toSafeNotification({
    title: content.title ?? undefined,
    body: content.body ?? undefined,
    data: (content.data ?? {}) as Record<string, unknown>,
  });
}

export function onNotificationTapped(
  handler: (notification: SafeNotification) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(safeNotificationFrom(response));
  });
  return () => subscription.remove();
}

/**
 * The notification that launched the app from cold, if any.
 *
 * Separate from the listener above because a tap that starts the process
 * arrives before any listener is attached — without this, opening the app from
 * a notification lands on the feed and the tap is silently lost.
 */
export async function launchNotification(): Promise<SafeNotification | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response ? safeNotificationFrom(response) : null;
}

/**
 * Asks at a moment that makes sense, or does nothing.
 *
 * The screens call this after the action that produces notifications — a first
 * post, activating listener mode, asking for a listener. `shouldAskForPermission`
 * is the gate, so the list of acceptable moments stays in one tested place
 * rather than spread across three screens.
 */
export async function maybeEnablePush(moment: string): Promise<boolean> {
  try {
    const granted = await permissionGranted();
    if (granted) {
      // Already allowed: re-register anyway, cheaply. The token may have
      // rotated while the app was closed.
      return enablePush();
    }
    if (!shouldAskForPermission(moment, await hasAskedBefore(), false)) return false;
    return enablePush();
  } catch {
    return false;
  }
}
