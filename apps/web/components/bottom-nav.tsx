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
    <div className="relative">
      {/*
        The FAB sits above the bar rather than in it. "+ Curhat" is the single
        most important action in the product (PRD §23) and the mock's five slots
        left no room for it, so it keeps the prominence it needs.
      */}
      <button
        type="button"
        onClick={onCreate}
        aria-label="Tulis curhat baru"
        // `min-h`/`min-w` with `aspect-square` rather than a fixed 56px box:
        // at 200% text scaling a fixed circle clips its own glyph (E15-T17).
        className="absolute -top-7 left-1/2 z-10 flex min-h-14 min-w-14 -translate-x-1/2 aspect-square items-center justify-center rounded-full bg-[var(--color-primary)] p-2 text-2xl font-bold text-[var(--color-primary-fg)] shadow-lg"
      >
        <span aria-hidden="true">+</span>
      </button>

      <nav
        aria-label="Navigasi utama"
        className="flex items-stretch justify-around border-t border-[var(--color-border)] bg-[var(--color-surface)] pt-1"
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
              className={`flex min-h-[var(--size-touch)] flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-1 text-xs ${
                isActive
                  ? // Weight and a top rule, not just colour.
                    'border-t-2 border-t-[var(--color-primary)] font-semibold text-[var(--color-text)]'
                  : 'text-[var(--color-muted)]'
              } disabled:opacity-45`}
            >
              <span aria-hidden="true" className="relative text-lg leading-none">
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
