import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ERROR_COPY,
  appStatus,
  evaluate,
  friendlyError,
  isOlderThan,
  resetAppStatus,
  setAppStatus,
  subscribeAppStatus,
} from './app-status';

afterEach(() => {
  resetAppStatus();
  vi.clearAllMocks();
});

function signal(status: number, headers: Record<string, string> = {}) {
  return {
    status,
    header: (name: string) => headers[name.toLowerCase()] ?? null,
  };
}

/**
 * Force update, maintenance and error copy — E16-T11.
 */
describe('version comparison', () => {
  it('knows when a build is genuinely behind', () => {
    expect(isOlderThan('0.9.0', '1.0.0')).toBe(true);
    expect(isOlderThan('1.0.9', '1.1.0')).toBe(true);
    expect(isOlderThan('1.2.3', '1.2.4')).toBe(true);
  });

  it('does not treat "not the newest" as "too old"', () => {
    // The whole point of the criterion: being behind the latest build is normal
    // and must not block anybody.
    expect(isOlderThan('1.0.0', '1.0.0')).toBe(false);
    expect(isOlderThan('2.0.0', '1.9.9')).toBe(false);
  });

  it('refuses to lock anyone out on a malformed version', () => {
    // A header mangled by a proxy must not brick the app.
    expect(isOlderThan('1.0.0', 'terbaru')).toBe(false);
    expect(isOlderThan('', '1.0.0')).toBe(false);
    expect(isOlderThan('1.0.0', '')).toBe(false);
  });
});

describe('what a response tells us', () => {
  it('stays out of the way when the server says nothing', () => {
    // The API does not send `x-min-app-version` yet. Until it does, every
    // response has to read as fine — a client that blocks by default would
    // brick itself the first time a header went missing.
    expect(evaluate(signal(200), '1.0.0')).toBe('ok');
    expect(evaluate(signal(404), '1.0.0')).toBe('ok');
  });

  it('forces an update only when the build is below the minimum', () => {
    expect(evaluate(signal(200, { 'x-min-app-version': '2.0.0' }), '1.0.0')).toBe('force_update');
    expect(evaluate(signal(200, { 'x-min-app-version': '1.0.0' }), '1.0.0')).toBe('ok');
    expect(evaluate(signal(200, { 'x-min-app-version': '1.0.0' }), '1.4.0')).toBe('ok');
  });

  it('treats 503 as maintenance and 500 as an ordinary failure', () => {
    expect(evaluate(signal(503), '1.0.0')).toBe('maintenance');
    // A bug is not a reason to put the whole app behind a maintenance wall.
    expect(evaluate(signal(500), '1.0.0')).toBe('ok');
  });

  it('prefers force update over maintenance when both apply', () => {
    // An old client cannot be trusted to interpret anything, maintenance
    // included.
    expect(evaluate(signal(503, { 'x-min-app-version': '9.0.0' }), '1.0.0')).toBe('force_update');
  });
});

describe('the status store', () => {
  it('tells subscribers only when the state actually changes', () => {
    const seen: string[] = [];
    subscribeAppStatus((status) => seen.push(status));

    setAppStatus('ok');
    setAppStatus('maintenance');
    setAppStatus('maintenance');
    setAppStatus('ok');

    expect(seen).toEqual(['maintenance', 'ok']);
    expect(appStatus()).toBe('ok');
  });
});

describe('error copy', () => {
  it('says the offline thing for a dropped connection', () => {
    const error = Object.assign(new Error('Network request failed'), { name: 'NetworkError' });
    expect(friendlyError(error)).toBe(ERROR_COPY['offline']);
  });

  it('shows the server sentence for errors the API planned for', () => {
    const error = Object.assign(new Error('Kamu baru aja posting.'), {
      name: 'ApiError',
      status: 429,
    });
    expect(friendlyError(error)).toBe('Kamu baru aja posting.');
  });

  it('never shows a raw technical message', () => {
    // "TypeError: undefined is not an object" is what an app says to somebody in
    // distress when nobody wrote the copy.
    expect(friendlyError(new TypeError('undefined is not an object'))).toBe(ERROR_COPY['unknown']);
    const serverError = Object.assign(new Error('Internal server error'), {
      name: 'ApiError',
      status: 500,
    });
    expect(friendlyError(serverError)).toBe(ERROR_COPY['server']);
  });

  it('is Indonesian all the way through', () => {
    for (const message of Object.values(ERROR_COPY)) {
      expect(message).not.toMatch(/error|failed|undefined|null|exception/i);
    }
  });
});
