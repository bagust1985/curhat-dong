'use client';

/**
 * Home feed furniture — E15-T08. DESIGN-REF §2.4.
 *
 * The cards themselves are E15-T02; this is everything around them: the tabs,
 * the skeleton, the two entry points that are not curhat cards, and the offline
 * banner.
 *
 * Nothing here counts anything about a person. No follower count, no ranking,
 * no leaderboard — PRD §11, and the reason the feed has tabs rather than a
 * "top" sort.
 */

export type FeedTabKey = 'untuk-kamu' | 'terbaru' | 'butuh-didengar' | 'topik';

export interface FeedTab {
  key: FeedTabKey;
  label: string;
  /** The empty-state copy key for this tab (lib/vocabulary.ts). */
  emptyContext: 'untukKamu' | 'feed' | 'butuhDidengar';
}

export const FEED_TABS: readonly FeedTab[] = [
  { key: 'untuk-kamu', label: 'Untuk Kamu', emptyContext: 'untukKamu' },
  { key: 'terbaru', label: 'Terbaru', emptyContext: 'feed' },
  { key: 'butuh-didengar', label: 'Butuh Didengar', emptyContext: 'butuhDidengar' },
  { key: 'topik', label: 'Topik', emptyContext: 'feed' },
];

export function FeedTabs({
  active,
  onSelect,
}: {
  active: FeedTabKey;
  onSelect: (key: FeedTabKey) => void;
}) {
  return (
    <div role="tablist" aria-label="Pilih feed" className="flex gap-2 overflow-x-auto pb-1">
      {FEED_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`feed-tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls="feed-panel"
          onClick={() => onSelect(tab.key)}
          className={`min-h-[var(--size-touch)] shrink-0 rounded-[var(--radius-chip)] border px-4 text-sm ${
            active === tab.key
              ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold text-[var(--color-text)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Loading placeholder.
 *
 * `aria-hidden` with a single polite status line beside it: announcing five
 * skeleton cards individually is noise, and "Lagi memuat cerita…" is the whole
 * message.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div>
      <p role="status" className="sr-only">
        Lagi memuat cerita…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="h-3 w-1/3 rounded bg-[var(--color-surface-alt)]" />
            <div className="mt-3 h-4 w-3/4 rounded bg-[var(--color-surface-alt)]" />
            <div className="mt-2 h-4 w-full rounded bg-[var(--color-surface-alt)]" />
            <div className="mt-4 h-6 w-24 rounded-full bg-[var(--color-surface-alt)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** DESIGN-REF §2.4 — the way into DONG AI for someone not ready to talk to a person. */
export function PrivateAiEntryCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section
      aria-labelledby="ai-entry-heading"
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4"
    >
      <h2 id="ai-entry-heading" className="text-base font-semibold text-[var(--color-text)]">
        Lagi pengen cerita tapi belum siap ngomong ke orang?
      </h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        DONG AI bisa nemenin dulu. Dia AI — bukan psikolog, dan nggak akan pura-pura jadi
        psikolog.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
      >
        Ngobrol sama DONG AI
      </button>
    </section>
  );
}

/**
 * Listener nudge — shown only to an active listener.
 *
 * States a need, never a quota. "Ada 12 orang menunggu, kamu baru bantu 2 hari
 * ini" would turn listening into a scoreboard, which PRD §12 rules out.
 */
export function ListenerNudgeBanner({
  waiting,
  onOpen,
  onDismiss,
}: {
  waiting: number;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  if (waiting <= 0) return null;

  return (
    <section
      aria-labelledby="nudge-heading"
      className="rounded-[var(--radius-curhat)] border border-l-4 border-[var(--color-border)] border-l-[var(--color-accent-amber)] bg-[var(--color-surface)] p-4"
    >
      <h2 id="nudge-heading" className="text-base font-semibold text-[var(--color-text)]">
        Ada orang yang sedang butuh didengar.
      </h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Kalau kamu lagi punya tenaga. Kalau nggak, nggak apa-apa juga.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 text-sm font-semibold text-[var(--color-text)]"
        >
          Lihat yang butuh didengar
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[var(--size-touch)] px-2 text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Nanti aja
        </button>
      </div>
    </section>
  );
}

export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <p className="text-sm font-semibold text-[var(--color-text)]">
        Koneksinya lagi putus-putus.
      </p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Yang udah kebuka tetap bisa dibaca. Sisanya nunggu sinyal balik.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 text-sm font-semibold text-[var(--color-text)]"
      >
        Coba lagi
      </button>
    </div>
  );
}
