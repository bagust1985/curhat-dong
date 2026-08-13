/**
 * Local draft autosave — E15-T09. DESIGN-REF §2.6.
 *
 * `localStorage`, and only for the draft. TECH-SPEC §5.1 forbids storing tokens
 * there; an unfinished curhat is different — it is the user's own text, on
 * their own device, and losing it because a tab crashed is the failure people
 * actually experience.
 *
 * It is cleared the moment the post is submitted. A draft that outlives its
 * post is a copy of something private sitting in a browser for no reason.
 */

const KEY = 'curhat-draft-v1';

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

/** Older than this and it is probably not what the person is coming back to. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveDraft(draft: Draft, now: number = Date.now()): void {
  try {
    if (draft.body.trim().length === 0 && draft.title.trim().length === 0) {
      clearDraft();
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // Private mode, quota, or storage disabled. A draft that cannot be saved
    // is not a reason to interrupt somebody mid-sentence.
  }
}

export function loadDraft(now: number = Date.now()): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.body !== 'string') return null;
    if (typeof parsed.savedAt === 'number' && now - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      clearDraft();
      return null;
    }

    return { ...EMPTY_DRAFT, ...parsed } as Draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
