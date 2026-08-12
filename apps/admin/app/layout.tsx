import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { ADMIN_NAV } from '../lib/navigation';

export const metadata: Metadata = {
  title: 'CURHAT DONG Admin',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell (E01-T07). Auth, MFA and RBAC land in E14 — every route below
 * is expected to sit behind that guard before any real data is wired in.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <nav
            aria-label="Navigasi admin"
            className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <p className="px-2 pb-4 text-sm font-semibold text-[var(--color-accent)]">
              CURHAT DONG
            </p>
            <ul className="space-y-1">
              {ADMIN_NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
