'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { BottomNav, type NavKey } from './bottom-nav';
import { MarkIcon } from './icons';
import { Wordmark } from './ui';
import { useSession } from '../lib/session';

/**
 * App shell — Revisi 2 (Aug 2026).
 *
 * Until now the bottom nav existed only on /home: every other screen was a
 * dead end you could only back out of. The mock shows the tab bar on every
 * app screen, which is also just what a tab bar is. This wraps the whole
 * `(app)` route group and decides where the bar belongs.
 *
 * Hidden on purpose on:
 *  - `/auth` and `/onboarding` — nobody should tab away mid-login or
 *    mid-consent; half an identity is worse than none;
 *  - `/room/*` — a live listening session is full-screen on purpose
 *    (DESIGN-REF §2.13); a visible tab bar is an invitation to leave someone
 *    mid-sentence;
 *  - `/moderation/*` — reading a decision about your account deserves the
 *    screen to itself.
 */

const HIDDEN_PREFIXES = ['/auth', '/onboarding', '/room/', '/moderation/'] as const;

/**
 * Longest-prefix mapping from pathname to the tab that should light up.
 *
 * Explore, search and listener resolve to their own rail entries now (E18-T02).
 * On a phone those three are not in the bar, so they fall through to Beranda —
 * which is where they are reached from, so the anchor is honest either way.
 */
function activeKeyFor(pathname: string): NavKey | null {
  if (pathname.startsWith('/home')) return 'beranda';
  if (pathname.startsWith('/ai')) return 'ai';
  if (pathname.startsWith('/notifications')) return 'notifikasi';
  if (pathname.startsWith('/profile')) return 'akun';
  if (pathname.startsWith('/listener')) return 'listener';
  if (pathname.startsWith('/explore')) return 'explore';
  if (pathname.startsWith('/search')) return 'cari';
  return null;
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { status } = useSession();

  const hidden =
    HIDDEN_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix)) ||
    // An anonymous visitor deep-linked into an app page has nowhere for these
    // tabs to go except /auth; the page's own guard handles that redirect.
    status === 'anonymous';

  if (hidden) return <>{children}</>;

  const nav = (
    <BottomNav
      active={activeKeyFor(pathname) ?? 'beranda'}
      onNavigate={(item) => {
        if (item.href) router.push(item.href);
      }}
      onCreate={() => router.push('/curhat/baru')}
    />
  );

  return (
    /*
     * Two layouts, one tree — E18-T02.
     *
     * Phone: content, then the nav pill sticky at the bottom. Desktop: a left
     * rail beside the content, the way a social product is read on a wide
     * screen (DESIGN-REF §1). The bottom bar stretched across a 1900px window
     * was the single worst thing on the desktop site.
     *
     * `order` rather than two renders of the nav: one element, one landmark,
     * one tab order.
     */
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col lg:flex-row lg:items-start lg:gap-8 lg:px-6">
      {/*
        `nav-fade` (globals.css) paints the ground in under the floating pill so
        content does not appear to scroll through the gap — and switches itself
        off at `lg`, where the rail already sits on the page ground. It is a
        class rather than an inline style because an inline background would
        win over any responsive override.
      */}
      <div className="nav-fade order-2 sticky bottom-0 lg:order-1 lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:pt-8">
        {/*
          The mark, desktop only: on a phone the rail has no room for it and
          the page headings carry the product's name instead.

          Drawn rather than served as the app icon, and one ink rather than
          two: this sits directly above eight monochrome icons, and the glossy
          rose PNG was the only saturated thing in the column. The full-colour
          mark still opens the landing page and the sign-up screens, where
          being loud is the job.
        */}
        <a
          href="/home"
          aria-label="Beranda CURHAT DONG"
          className="mb-6 hidden items-center gap-2.5 px-5 text-[var(--color-text)] lg:flex"
        >
          <MarkIcon className="size-8" />
          <Wordmark tone="mono" />
        </a>

        {nav}
      </div>

      {/* pb keeps the last line of content above the bar on a phone. */}
      <div className="order-1 min-w-0 flex-1 pb-24 lg:order-2 lg:pb-12">{children}</div>
    </div>
  );
}
