'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '../../../lib/session';

/**
 * `/profile` — the "Akun" tab's landing spot (Revisi, 13 Aug 2026).
 *
 * The bottom nav's Akun slot points at a static `/profile` href because
 * `NAV_ITEMS` is static data that tests assert against — the nav cannot know
 * an alias at module scope, and making the href dynamic would trade a testable
 * constant for a race with session loading. So the alias resolution happens
 * here instead: this page owns the redirect to `/profile/:alias`.
 */
export default function OwnProfileRedirect() {
  const router = useRouter();
  const { status, user } = useSession();

  useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(`/profile/${encodeURIComponent(user.alias)}`);
    } else if (status === 'anonymous') {
      router.replace('/auth');
    } else if (status === 'onboarding') {
      router.replace('/onboarding');
    }
    // 'loading' renders the skeleton below until the session resolves.
  }, [status, user, router]);

  return (
    <main
      aria-busy="true"
      className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10"
    >
      <p role="status" className="sr-only">
        Lagi dimuat…
      </p>
      <div aria-hidden="true" className="animate-pulse space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-[var(--color-surface-alt)]" />
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-[var(--color-surface-alt)]" />
            <div className="h-3 w-24 rounded bg-[var(--color-surface-alt)]" />
          </div>
        </div>
        <div className="h-24 rounded-[var(--radius-curhat)] bg-[var(--color-surface-alt)]" />
      </div>
    </main>
  );
}
