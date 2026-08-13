import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local draft — E16-T05. DESIGN-REF §2.6.
 *
 * AsyncStorage rather than SecureStore, deliberately. A draft is the user's own
 * unfinished text on their own device, not a credential; putting it in the
 * keystore would mean an encrypted read on every keystroke and would blur the
 * line about what SecureStore is for (TECH-SPEC §5.1 — tokens, and only tokens).
 *
 * Cleared the moment the post is submitted: a draft that outlives its post is a
 * private copy sitting on a phone for no reason.
 */

const KEY = 'curhat.draft.v1';

export interface Draft {
  title: string;
  body: string;
  categorySlug: string | null;
  mood: string | null;
  intent: string | null;
  anonymityMode: 'alias' | 'anonymous';
  allowComments: boolean;
  requestListener: boolean;
  savedAt: number;
}

export const EMPTY_DRAFT: Draft = {
  title: '',
  body: '',
  categorySlug: null,
  mood: null,
  intent: null,
  anonymityMode: 'alias',
  allowComments: true,
  requestListener: false,
  savedAt: 0,
};

export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Injectable so the rules can be tested without a device. */
export interface KeyValueStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

let store: KeyValueStore = AsyncStorage;

export function setDraftStore(next: KeyValueStore): void {
  store = next;
}

export async function saveDraft(draft: Draft, now: number = Date.now()): Promise<void> {
  try {
    if (draft.body.trim().length === 0 && draft.title.trim().length === 0) {
      await clearDraft();
      return;
    }
    await store.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // A draft that cannot be saved is not a reason to interrupt somebody
    // mid-sentence.
  }
}

export async function loadDraft(now: number = Date.now()): Promise<Draft | null> {
  try {
    const raw = await store.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.body !== 'string') return null;
    if (typeof parsed.savedAt === 'number' && now - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      await clearDraft();
      return null;
    }

    return { ...EMPTY_DRAFT, ...parsed } as Draft;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await store.removeItem(KEY);
  } catch {
    /* nothing to recover */
  }
}
