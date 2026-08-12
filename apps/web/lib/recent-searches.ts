/**
 * Recent searches — E13-T04. DESIGN-REF §2.13.
 *
 * On the device, and only on the device. There is no endpoint that accepts a
 * search history and none that returns one, which is the point: what someone
 * searches for in an app about their private life is at least as revealing as
 * what they wrote, and often more — a search is a question you have not
 * decided to say out loud yet.
 *
 * Keeping it local also means "clear history" is genuinely clearing it. A
 * server-side copy would make that button a request rather than a deletion,
 * and there would be backups behind it.
 */

const STORAGE_KEY = 'curhat.recent_searches';

/**
 * Kept deliberately short.
 *
 * A long history on a shared device is a list of somebody's worries left where
 * the next person to pick up the phone can read it.
 */
const MAX_ENTRIES = 8;

/** Longer than this is a paste, not something worth suggesting again. */
const MAX_LENGTH = 120;

function storage(): Storage | null {
  try {
    // Absent during server rendering, and disabled outright in some private
    // browsing modes. Both mean "no history", not an error.
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentSearches(): string[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.slice(0, MAX_LENGTH))
      .slice(0, MAX_ENTRIES);
  } catch {
    // Corrupt storage reads as empty rather than throwing on a search page.
    return [];
  }
}

/**
 * Records a query, newest first, without duplicates.
 *
 * Case-insensitive dedup, because "Capek" and "capek" are the same question
 * and showing both wastes half a short list.
 */
export function rememberSearch(query: string): string[] {
  const store = storage();
  const trimmed = query.trim().slice(0, MAX_LENGTH);
  if (!store || trimmed.length === 0) return readRecentSearches();

  const existing = readRecentSearches().filter(
    (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next = [trimmed, ...existing].slice(0, MAX_ENTRIES);

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded, or storage disabled mid-session. The search still works;
    // it just is not remembered.
  }

  return next;
}

/** Removes one entry — the small "x" beside a suggestion. */
export function forgetSearch(query: string): string[] {
  const store = storage();
  if (!store) return [];

  const next = readRecentSearches().filter(
    (entry) => entry.toLowerCase() !== query.trim().toLowerCase(),
  );

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return readRecentSearches();
  }

  return next;
}

/** Wipes the history — reachable from Settings (DESIGN-REF §2.16). */
export function clearRecentSearches(): void {
  const store = storage();
  if (!store) return;

  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing further to try; the key is either gone or unreachable.
  }
}
