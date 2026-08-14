'use client';

import {
  BellIcon,
  ChatIcon,
  CompassIcon,
  HeartIcon,
  HomeIcon,
  PersonIcon,
  SearchIcon,
  UsersIcon,
} from './icons';

/**
 * Primary navigation — E15-T03, made responsive in E18-T02.
 *
 * ## Why this shape
 *
 * One list of destinations rendered two ways: the floating five-slot bar on a
 * phone (the brand mock, 12 Aug 2026) and the left rail on desktop that
 * DESIGN-REF §1 always specified.
 *
 *  - **Komunitas is Phase 2.** `communities.enabled` defaults to false (PRD §16)
 *    and there is no backend behind it. It renders disabled with an honest
 *    label rather than as a live tab leading nowhere;
 *  - **Explore, Listen and Cari only fit on desktop.** A phone bar holds five,
 *    so on a phone those three are reached from the Beranda tiles instead —
 *    which is why those tiles exist, and why they disappear at `lg` where the
 *    rail already lists them. Leaving them unreachable anywhere would have
 *    quietly removed MVP features;
 *  - **+ Curhat has no slot in either.** It is the FAB on a phone and the
 *    rail's full-width CTA on desktop: one button, one accessible name.
 */

export type NavKey =
  | 'beranda'
  | 'ai'
  | 'komunitas'
  | 'notifikasi'
  | 'listener'
  | 'explore'
  | 'cari'
  | 'akun';

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  /**
   * Monochrome, `currentColor` — E18-T03. Not an emoji: every platform draws
   * its own, they bring colours into a palette that uses colour to mean things,
   * and at 18px they turn to mud.
   */
  Icon: (props: { className?: string }) => React.ReactElement;
  /**
   * Whether this destination appears in the phone bar — E18-T02.
   *
   * Five is what fits across a phone, so three destinations live only in the
   * desktop rail. On a phone those three are reached from the Beranda tiles,
   * which is exactly why those tiles exist and why they disappear at `lg`.
   */
  onPhone: boolean;
  /** Unread or waiting count. Absent means no badge. */
  badge?: number;
}

/**
 * Every destination, in rail order.
 *
 * `komunitas` carries no href: it is not a destination yet, and giving it one
 * would make a dead link that looks alive.
 *
 * One list rather than a phone list and a desktop list. The bar and the rail
 * are the same navigation seen through different windows, and two lists would
 * drift the first time somebody added a screen to only one of them.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'beranda', href: '/home', label: 'Beranda', Icon: HomeIcon, onPhone: true },
  { key: 'ai', href: '/ai', label: 'DONG AI', Icon: ChatIcon, onPhone: true },
  { key: 'komunitas', href: '', label: 'Komunitas', Icon: UsersIcon, onPhone: true },
  { key: 'notifikasi', href: '/notifications', label: 'Notifikasi', Icon: BellIcon, onPhone: true },
  {
    key: 'listener',
    href: '/listener/request',
    label: 'Cari Listener',
    Icon: HeartIcon,
    onPhone: false,
  },
  { key: 'explore', href: '/explore', label: 'Jelajah', Icon: CompassIcon, onPhone: false },
  { key: 'cari', href: '/search', label: 'Cari', Icon: SearchIcon, onPhone: false },
  { key: 'akun', href: '/profile', label: 'Akun', Icon: PersonIcon, onPhone: true },
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
              //
              // The three rail-only destinations are display:none on a phone,
              // which keeps them out of the tab order and the accessibility
              // tree there rather than merely out of sight.
              className={`${item.onPhone ? 'flex' : 'hidden lg:flex'} min-h-[var(--size-touch)] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-chip)] px-1 py-1 text-[11px] lg:w-full lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-5 lg:py-3 lg:text-[15px] ${
                isActive
                  ? // A filled pill plus the weight change. `aria-current` is
                    // what actually announces it, so this is never the only
                    // signal — but on a floating bar a top rule has no edge to
                    // sit against, so the fill replaces it.
                    'bg-[var(--color-primary)] font-bold text-[var(--color-primary-fg)]'
                  : 'text-[var(--color-muted)]'
              } disabled:opacity-45`}
            >
              <span aria-hidden="true" className="relative leading-none">
                <item.Icon className="size-[22px] lg:size-6" />
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
