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
              ? // A filled pill rather than a tinted one: with four tabs on a
                // blush ground, a tint reads as "slightly different", not as
                // "this is the one you are looking at".
                'border-[var(--color-primary)] bg-[var(--color-primary)] font-bold text-[var(--color-primary-fg)]'
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
            className="animate-pulse rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-[18px] shadow-[var(--shadow-card)]"
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

/**
 * The hero — Revisi 2, rebuilt as a composer in E18-T01.
 *
 * It used to be a card *about* writing: a mascot, a sentence, and a button that
 * took you somewhere else. Now it looks like the thing it opens. The field is
 * not a real textarea — the composer is a route (`/curhat/baru`) so a draft
 * survives a refresh — but it reads as one, and clicking anywhere in it does
 * what clicking a text box should do.
 *
 * The heading stays for screen readers and for the section landmark. Sighted
 * readers get the placeholder, which says the same thing in the same words.
 */
export function StartCurhatCard({ onStart }: { onStart: () => void }) {
  return (
    <section
      aria-labelledby="mulai-curhat-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]"
    >
      <h2 id="mulai-curhat-heading" className="sr-only">
        Mulai curhat sekarang
      </h2>

      <div className="flex items-start gap-3">
        {/* Decorative: the button below carries the action in words. */}
        <img
          src="/brand/mascot.png"
          alt=""
          width={297}
          height={232}
          className="h-auto w-12 shrink-0 sm:w-14"
        />
        <button
          type="button"
          onClick={onStart}
          tabIndex={-1}
          aria-hidden="true"
          // A shortcut for the mouse, hidden from the keyboard and screen
          // reader: the real control is the labelled button underneath, and
          // two tab stops onto the same action is noise.
          className="min-h-[3.75rem] flex-1 rounded-[var(--radius-curhat)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-left text-[var(--color-muted)]"
        >
          Tulis apa adanya aja…
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">Bisa anonim. Nggak harus rapi.</p>
        <button
          type="button"
          onClick={onStart}
          className="inline-flex min-h-[var(--size-touch)] items-center rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
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
  /**
   * Tint token for the glyph plate. Four identical grey plates made the shelf
   * read as one undifferentiated block; the tint is a landmark, not decoration,
   * which is why it is fixed per destination rather than cycled by position.
   */
  tint: string;
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
    // Lavender throughout for DONG AI — the supporting hue is how the AI reads
    // as a different kind of company from the people.
    tint: 'var(--color-tint-lavender)',
  },
  {
    key: 'listener',
    label: 'Cari Listener',
    glyph: '🤍',
    href: '/listener/request',
    description: 'Minta ditemani listener manusia',
    tint: 'var(--color-tint-pink)',
  },
  {
    key: 'explore',
    label: 'Jelajah',
    glyph: '🧭',
    href: '/explore',
    description: 'Lihat cerita dari topik lain',
    tint: 'var(--color-tint-amber)',
  },
  {
    key: 'search',
    label: 'Cari',
    glyph: '🔍',
    href: '/search',
    description: 'Cari cerita, topik, atau listener',
    tint: 'var(--color-tint-rose)',
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
              className="flex min-h-[var(--size-touch)] w-full flex-col items-center gap-2 rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-3 text-center shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
            >
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-[var(--radius-curhat)] text-xl"
                style={{ backgroundColor: link.tint }}
              >
                {link.glyph}
              </span>
              <span className="text-xs leading-tight font-bold text-[var(--color-text)]">
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
    // Lavender ground, matching the DONG AI tile above it: the AI is a
    // different kind of company from the people on this screen, and the colour
    // is what says so before the copy does.
    <section
      aria-labelledby="ai-entry-heading"
      className="rounded-[var(--radius-curhat)] bg-[var(--color-tint-lavender)] p-5"
    >
      <h2 id="ai-entry-heading" className="text-base font-bold text-[var(--color-text)]">
        Lagi pengen cerita tapi belum siap ngomong ke orang?
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text)] opacity-80">
        DONG AI bisa nemenin dulu. Dia AI — bukan psikolog, dan nggak akan pura-pura jadi
        psikolog.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-accent-lavender)] px-5 font-bold text-[var(--color-primary-fg)]"
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
      className="rounded-[var(--radius-curhat)] border-l-4 border-l-[var(--color-accent-amber)] bg-[var(--color-surface)] p-[18px] shadow-[var(--shadow-card)]"
    >
      <h2 id="nudge-heading" className="text-base font-bold text-[var(--color-text)]">
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
      className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-[18px] shadow-[var(--shadow-card)]"
    >
      <p className="text-sm font-bold text-[var(--color-text)]">
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
