'use client';

/**
 * Bottom navigation and the "+ Curhat" FAB — E15-T03.
 *
 * ## Why this shape
 *
 * The five slots follow the brand mock (Beranda · Chat · Komunitas · Notifikasi
 * · Akun), decided 12 Aug 2026. That differs from PRD §23 and DESIGN-REF §1,
 * which specify HOME · EXPLORE · [+ CURHAT] · LISTEN · PROFILE, so two things
 * are handled deliberately rather than dropped:
 *
 *  - **Komunitas is Phase 2.** `communities.enabled` defaults to false (PRD §16)
 *    and there is no backend behind it. It renders disabled with an honest
 *    label rather than as a live tab leading nowhere;
 *  - **Explore, Listen and + Curhat lost their slots.** `+ Curhat` becomes the
 *    FAB the mock already shows, and Explore and Listen are reached from Beranda.
 *    Leaving them unreachable would have quietly removed MVP features, which is
 *    a different decision from changing a navigation bar.
 */

export type NavKey = 'beranda' | 'chat' | 'komunitas' | 'notifikasi' | 'akun';

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  glyph: string;
  /** Unread or waiting count. Absent means no badge. */
  badge?: number;
}

/**
 * The five slots.
 *
 * `komunitas` carries no href: it is not a destination yet, and giving it one
 * would make a dead link that looks alive.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'beranda', href: '/home', label: 'Beranda', glyph: '🏠' },
  { key: 'chat', href: '/ai', label: 'Chat', glyph: '💬' },
  { key: 'komunitas', href: '', label: 'Komunitas', glyph: '👥' },
  { key: 'notifikasi', href: '/notifications', label: 'Notifikasi', glyph: '🔔' },
  { key: 'akun', href: '/profile', label: 'Akun', glyph: '👤' },
];

/** Phase 2 (PRD §16), behind `communities.enabled`. */
export const PHASE_TWO_KEYS: readonly NavKey[] = ['komunitas'];

export function BottomNav({
  active,
  badges = {},
  communitiesEnabled = false,
  onNavigate,
  onCreate,
}: {
  active: NavKey;
  badges?: Partial<Record<NavKey, number>>;
  communitiesEnabled?: boolean;
  onNavigate: (item: NavItem) => void;
  onCreate: () => void;
}) {
  return (
    /*
     * One nav, two shapes — E18-T02.
     *
     * Below `lg` it is the floating pill at the bottom of a phone. From `lg` up
     * it becomes the left rail a desktop social product is expected to have
     * (DESIGN-REF §1, which specified this and was never built): the pill
     * stretched the full width of a 1900px window, which is what made it read
     * as browser chrome rather than part of the room.
     *
     * Deliberately not two components. Two navs would mean two landmarks, two
     * tab orders and two places for the same rule to drift — and on the one
     * screen where a screen reader most needs a single answer to "where am I".
     */
    <div className="relative px-[var(--spacing-gutter)] pt-3 pb-5 lg:flex lg:flex-col lg:px-0 lg:pt-0 lg:pb-0">
      {/*
        The composer CTA. A circle above the bar on a phone, where five slots
        left no room for it; a full-width button in the rail on desktop, where
        there is room and it is the single most important action (PRD §23).
        One button, one accessible name — the label is what changes.
      */}
      <button
        type="button"
        onClick={onCreate}
        aria-label="Tulis curhat baru"
        // `min-h`/`min-w` with `aspect-square` rather than a fixed 56px box:
        // at 200% text scaling a fixed circle clips its own glyph (E15-T17).
        // The ring is the page ground, so the FAB punches through the pill
        // instead of sitting on top of it.
        className="absolute -top-4 left-1/2 z-10 flex min-h-14 min-w-14 -translate-x-1/2 aspect-square items-center justify-center rounded-full border-4 border-[var(--color-bg)] bg-[var(--color-primary)] p-2 text-2xl font-bold text-[var(--color-primary-fg)] shadow-lg lg:static lg:order-2 lg:mt-5 lg:aspect-auto lg:w-full lg:min-w-0 lg:translate-x-0 lg:rounded-[var(--radius-action)] lg:border-0 lg:px-6 lg:py-3 lg:text-base"
      >
        <span aria-hidden="true" className="lg:hidden">
          +
        </span>
        <span aria-hidden="true" className="hidden lg:inline">
          + Curhat
        </span>
      </button>

      <nav
        aria-label="Navigasi utama"
        className="flex items-stretch justify-around gap-1 rounded-[var(--radius-chip)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-nav)] lg:order-1 lg:flex-col lg:justify-start lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
      >
        {NAV_ITEMS.map((item) => {
          const isPhaseTwo = PHASE_TWO_KEYS.includes(item.key);
          const disabled = isPhaseTwo && !communitiesEnabled;
          const isActive = active === item.key;
          const badge = badges[item.key] ?? 0;

          return (
            <button
              key={item.key}
              type="button"
              disabled={disabled}
              onClick={() => onNavigate(item)}
              aria-current={isActive ? 'page' : undefined}
              // Says *why* it is unavailable. A disabled tab with no explanation
              // reads as a bug the reader caused.
              aria-label={
                disabled
                  ? `${item.label} — belum tersedia`
                  : badge > 0
                    ? `${item.label}, ${badge} belum dibaca`
                    : item.label
              }
              // Phone: glyph stacked over a tiny label, five across.
              // Desktop: a full-width row, glyph beside a readable label —
              // the shape a left rail is read in.
              className={`flex min-h-[var(--size-touch)] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-chip)] px-1 py-1 text-[11px] lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-5 lg:py-3 lg:text-[15px] ${
                isActive
                  ? // A filled pill plus the weight change. `aria-current` is
                    // what actually announces it, so this is never the only
                    // signal — but on a floating bar a top rule has no edge to
                    // sit against, so the fill replaces it.
                    'bg-[var(--color-primary)] font-bold text-[var(--color-primary-fg)]'
                  : 'text-[var(--color-muted)]'
              } disabled:opacity-45`}
            >
              <span aria-hidden="true" className="relative text-lg leading-none lg:text-xl">
                {item.glyph}
                {badge > 0 ? (
                  <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-[var(--color-brand)] px-1 text-[10px] font-bold text-[var(--color-accent-fg)]">
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
