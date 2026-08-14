'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { BottomNav, type NavKey } from './bottom-nav';
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

/** Longest-prefix mapping from pathname to the tab that should light up. */
function activeKeyFor(pathname: string): NavKey | null {
  if (pathname.startsWith('/home')) return 'beranda';
  if (pathname.startsWith('/ai')) return 'chat';
  if (pathname.startsWith('/notifications')) return 'notifikasi';
  if (pathname.startsWith('/profile')) return 'akun';
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

  return (
    <div className="flex min-h-screen flex-col">
      {/* pb keeps the last line of content above the bar. */}
      <div className="flex-1 pb-24">{children}</div>
      {/*
        The bar floats now (E18-T01), so the strip it sits in is transparent —
        and content scrolling through that gap looked like a rendering bug. The
        ground fades in underneath instead: the pill still reads as lifted, and
        nothing slides out from behind it.
      */}
      <div
        className="sticky bottom-0"
        style={{
          background:
            'linear-gradient(to top, var(--color-bg) 55%, color-mix(in srgb, var(--color-bg) 70%, transparent) 80%, transparent 100%)',
        }}
      >
        <BottomNav
          active={activeKeyFor(pathname) ?? 'beranda'}
          onNavigate={(item) => {
            if (item.href) router.push(item.href);
          }}
          onCreate={() => router.push('/curhat/baru')}
        />
      </div>
    </div>
  );
}
