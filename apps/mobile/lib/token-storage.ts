import * as SecureStore from 'expo-secure-store';

/**
 * Refresh-token storage — E16-T03. TECH-SPEC §5.1, §5.3.
 *
 * **SecureStore, never AsyncStorage.** AsyncStorage is a plain file in the
 * app's sandbox: readable on a rooted device, in a backup, and by anything that
 * gets code execution in the process. SecureStore is backed by the Android
 * Keystore. On this product a refresh token is a key to somebody's private
 * conversations, so the difference is not academic.
 *
 * The **access token never comes here.** It lives in memory for 15 minutes and
 * writing it to disk would trade a short-lived secret for a persistent one.
 */

const REFRESH_KEY = 'curhat.refresh_token';

/** Injectable so the rules can be tested without a device keystore. */
export interface SecureBackend {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

let backend: SecureBackend = SecureStore;

export function setSecureBackend(next: SecureBackend): void {
  backend = next;
}

export async function readRefreshToken(): Promise<string | null> {
  try {
    return await backend.getItemAsync(REFRESH_KEY);
  } catch {
    // A keystore that refuses to open is the same situation as no session:
    // ask the person to sign in rather than crashing on launch.
    return null;
  }
}

export async function writeRefreshToken(token: string): Promise<void> {
  try {
    await backend.setItemAsync(REFRESH_KEY, token);
  } catch {
    // Nothing useful to do. The session still works until the access token
    // expires; failing loudly here would block a login that otherwise succeeded.
  }
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await backend.deleteItemAsync(REFRESH_KEY);
  } catch {
    /* nothing to recover */
  }
}

/** Exported for the test that asserts nothing else is ever written. */
export const STORAGE_KEYS = { refresh: REFRESH_KEY } as const;
