import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { ThemeScript } from '../components/theme-script';

export const metadata: Metadata = {
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
    <html lang="id" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
