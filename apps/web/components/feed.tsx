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
/**
 * The mock's hero card — Revisi 2. Mascot, one sentence, one pill button.
 *
 * "+ Curhat" already exists as the FAB, but the FAB is a glyph: it only reads
 * as "write something" to someone who already knows the product. This is the
 * same action stated in words, on the first screen after logging in.
 */
export function StartCurhatCard({ onStart }: { onStart: () => void }) {
  return (
    <section
      aria-labelledby="mulai-curhat-heading"
      className="flex items-center gap-4 rounded-[var(--radius-curhat)] bg-[var(--color-surface-alt)] p-5"
    >
      {/* Decorative: the heading beside it says the same thing in words. */}
      <img
        src="/brand/mascot.png"
        alt=""
        width={297}
        height={232}
        className="h-auto w-16 shrink-0 sm:w-20"
      />
      <div className="min-w-0">
        <h2 id="mulai-curhat-heading" className="text-base font-bold text-[var(--color-text)]">
          Mulai curhat sekarang
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
          Nggak harus rapi. Tulis apa adanya aja.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-3 inline-flex min-h-[var(--size-touch)] items-center rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-bold text-[var(--color-primary-fg)]"
        >
          Mulai Curhat
        </button>
      </div>
    </section>
  );
}

export interface QuickLink {
  key: string;
  label: string;
  /** Decorative — the label carries the meaning. */
  glyph: string;
  href: string;
  /** Announced to screen readers; the tile itself is short by design. */
  description: string;
}

/**
 * "Fitur Utama" — Revisi 2, from the brand mock.
 *
 * The mock's four tiles are AI Mendengar · Komunitas · Jurnal · Relaksasi.
 * Three of those do not exist: Komunitas is Phase 2 with no backend
 * (`communities.enabled: false`), and Jurnal and Relaksasi appear nowhere in
 * the product, the PRD or the tech spec — "journal" exists only as a DONG AI
 * personality mode, which is a different thing wearing the same word.
 *
 * So the shelf keeps the mock's shape and fills it with the features that are
 * actually behind it. A grid of tiles where three lead nowhere teaches people
 * that this product's buttons are decorative, and that lesson is expensive to
 * un-teach.
 */
export const QUICK_LINKS: readonly QuickLink[] = [
  {
    key: 'ai',
    label: 'DONG AI',
    glyph: '💬',
    href: '/ai',
    description: 'Ngobrol sama DONG AI, teman ngobrol yang selalu ada',
  },
  {
    key: 'listener',
    label: 'Cari Listener',
    glyph: '🤍',
    href: '/listener/request',
    description: 'Minta ditemani listener manusia',
  },
  {
    key: 'explore',
    label: 'Jelajah',
    glyph: '🧭',
    href: '/explore',
    description: 'Lihat cerita dari topik lain',
  },
  {
    key: 'search',
    label: 'Cari',
    glyph: '🔍',
    href: '/search',
    description: 'Cari cerita, topik, atau listener',
  },
];

export function QuickLinksGrid({ onOpen }: { onOpen: (link: QuickLink) => void }) {
  return (
    <section aria-labelledby="fitur-utama-heading">
      <h2 id="fitur-utama-heading" className="text-base font-bold text-[var(--color-text)]">
        Fitur Utama
      </h2>

      <ul className="mt-3 grid grid-cols-4 gap-2">
        {QUICK_LINKS.map((link) => (
          <li key={link.key}>
            <button
              type="button"
              onClick={() => onOpen(link)}
              aria-label={link.description}
              className="flex min-h-[var(--size-touch)] w-full flex-col items-center gap-1.5 rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-3 text-center"
            >
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-[var(--radius-curhat)] bg-[var(--color-surface-alt)] text-xl"
              >
                {link.glyph}
              </span>
              <span className="text-xs leading-tight font-semibold text-[var(--color-text)]">
                {link.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
