import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';
import { ThemeScript } from '../components/theme-script';

/**
 * Nunito — the brand kit's rounded face (docs/, Revisi 2). Downloaded at
 * BUILD time and self-hosted by next/font: the served page makes no request
 * to Google, which is what keeps the landing page's no-fetch test honest and
 * visitors' IPs out of a third party's logs.
 */
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  // Needed so the landing page's canonical URL resolves to an absolute one
  // (E15-T05). Falls back to the production domain when the env var is absent,
  // which is the only value that would be correct in a real deployment anyway.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://curhatdong.com'),
  title: 'CURHAT DONG',
  description: 'Kadang kita nggak butuh solusi. Kita cuma butuh didengar.',
  // CLAUDE.md non-negotiable #5: curhat pages are never indexed. The landing
  // page opts back in explicitly (E15-T05); everything else stays out.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1420' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={nunito.variable}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
