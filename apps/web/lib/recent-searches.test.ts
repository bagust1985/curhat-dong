import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearRecentSearches,
  forgetSearch,
  readRecentSearches,
  rememberSearch,
} from './recent-searches.js';

/** Minimal localStorage. The behaviour under test is all in our own code. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();

  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recent searches (E13-T04)', () => {
  it('keeps the newest query first', () => {
    rememberSearch('capek kerja');
    rememberSearch('kesepian');

    expect(readRecentSearches()).toEqual(['kesepian', 'capek kerja']);
  });

  it('does not list the same question twice in different cases', () => {
    rememberSearch('Capek');
    rememberSearch('capek');

    expect(readRecentSearches()).toEqual(['capek']);
  });

  it('keeps the list short', () => {
    // A long history on a shared device is a list of somebody's worries left
    // where the next person to pick up the phone can read it.
    for (let i = 0; i < 20; i += 1) rememberSearch(`kata-${i}`);

    expect(readRecentSearches()).toHaveLength(8);
    expect(readRecentSearches()[0]).toBe('kata-19');
  });

  it('ignores a blank query', () => {
    rememberSearch('   ');
    expect(readRecentSearches()).toEqual([]);
  });

  it('removes a single entry', () => {
    rememberSearch('capek');
    rememberSearch('kesepian');

    expect(forgetSearch('capek')).toEqual(['kesepian']);
  });

  it('clears everything', () => {
    rememberSearch('capek');
    clearRecentSearches();

    expect(readRecentSearches()).toEqual([]);
  });

  it('reads as empty rather than throwing on corrupt storage', () => {
    window.localStorage.setItem('curhat.recent_searches', 'bukan json');
    expect(readRecentSearches()).toEqual([]);

    window.localStorage.setItem('curhat.recent_searches', '{"not":"an array"}');
    expect(readRecentSearches()).toEqual([]);
  });

  it('works when storage is unavailable', () => {
    // Private browsing modes disable localStorage outright. That means "no
    // history", not a broken search page.
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    });

    expect(readRecentSearches()).toEqual([]);
    expect(() => rememberSearch('capek')).not.toThrow();
    expect(() => clearRecentSearches()).not.toThrow();
  });

  it('returns nothing during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(readRecentSearches()).toEqual([]);
  });
});

describe('history never leaves the device (E13-T04)', () => {
  const source = readFileSync(join(process.cwd(), 'lib/recent-searches.ts'), 'utf8');

  it('makes no network call', () => {
    // The acceptance criterion is checked in CI rather than by watching the
    // network tab, because a later "sync your searches across devices" is one
    // plausible afternoon away from making the claim false.
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon|axios/);
    expect(source).not.toMatch(/https?:\/\//);
  });

  it('has no server counterpart', () => {
    // Nothing in the API should accept or return a search history.
    const apiSources = join(process.cwd(), '../api/src/modules/search');
    const files = readdirSync(apiSources).filter((entry) => entry.endsWith('.ts'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(join(apiSources, file), 'utf8');
      expect(content, file).not.toMatch(/recent[_-]?search|searchHistory|search_history/i);
    }
  });
});
