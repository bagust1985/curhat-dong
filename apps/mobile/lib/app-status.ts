/**
 * Force update and maintenance — E16-T11.
 *
 * ## The honest state of this
 *
 * The API has **no** version or maintenance endpoint today. Rather than invent
 * one client-side, this reads two signals the API can start sending whenever
 * E17 adds them:
 *
 *  - `x-min-app-version` on any response — the oldest build the server still
 *    supports;
 *  - a `503 SERVICE_UNAVAILABLE` — planned maintenance.
 *
 * Until the header exists, `evaluate` returns `ok` for every response, which is
 * the safe direction: a client that blocks by default would brick itself the
 * first time a proxy stripped a header.
 *
 * The rule from the task — "force update blocks only when the version really is
 * incompatible" — is why the comparison is `installed < minimum` and not
 * `installed !== latest`. Being behind the newest build is normal.
 */

export type AppStatus = 'ok' | 'force_update' | 'maintenance';

/**
 * Compares dotted numeric versions.
 *
 * Deliberately small: the app's own version is set in `app.config.ts` and is
 * always `major.minor.patch`. Anything unparseable compares as equal, so a
 * malformed header cannot lock anybody out.
 */
export function isOlderThan(installed: string, minimum: string): boolean {
  const parse = (value: string) =>
    value
      .trim()
      .split('.')
      .map((part) => Number.parseInt(part, 10));

  const left = parse(installed);
  const right = parse(minimum);

  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return false;

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }

  return false;
}

export interface ResponseSignal {
  status: number;
  /** Case-insensitive lookup, the way `Headers.get` behaves. */
  header: (name: string) => string | null;
}

export function evaluate(signal: ResponseSignal, installedVersion: string): AppStatus {
  const minimum = signal.header('x-min-app-version');
  if (minimum && isOlderThan(installedVersion, minimum)) return 'force_update';

  // 503 is the only status that means "the server is deliberately away". A 500
  // is a bug and must not put the whole app behind a maintenance wall.
  if (signal.status === 503) return 'maintenance';

  return 'ok';
}

// ---------------------------------------------------------------------------
// A tiny store, so any request can raise the state and the root layout can show
// the screen. Deliberately not React context: the API client is not a component
// and should not have to be.
// ---------------------------------------------------------------------------

let current: AppStatus = 'ok';
const listeners = new Set<(status: AppStatus) => void>();

export function appStatus(): AppStatus {
  return current;
}

export function setAppStatus(next: AppStatus): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(next);
}

export function subscribeAppStatus(listener: (status: AppStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper — resets the module-level state between cases. */
export function resetAppStatus(): void {
  current = 'ok';
  listeners.clear();
}

/**
 * Error copy — E16-T11.
 *
 * Indonesian, and never the raw technical message. `ApiError.message` is already
 * user-facing copy from the server, but a network stack error ("Network request
 * failed") is not, and showing it is how an app tells somebody in distress that
 * something called TypeError happened.
 */
export const ERROR_COPY: Record<string, string> = {
  offline: 'Koneksinya lagi putus-putus. Yang udah kebuka tetap bisa dibaca.',
  server: 'Ada yang nggak beres di sisi kami. Coba lagi sebentar lagi ya.',
  unknown: 'Belum berhasil. Coba lagi ya.',
};

export function friendlyError(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: string }).name;
    if (name === 'NetworkError') return ERROR_COPY['offline'] as string;
    if (name === 'ApiError') {
      const message = (error as { message?: string }).message;
      const status = (error as { status?: number }).status ?? 0;
      // The server writes Indonesian copy for the errors it expects; anything
      // 5xx is not something it planned to explain.
      if (status >= 500 || !message) return ERROR_COPY['server'] as string;
      return message;
    }
  }
  return ERROR_COPY['unknown'] as string;
}
