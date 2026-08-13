import type { Metadata } from 'next';

import {
  LandingFeatures,
  LandingFooter,
  LandingHero,
  LandingNavbar,
  LandingPreviewFeed,
  LandingValueProps,
} from '../components/landing';

/**
 * Landing page — E15-T05. DESIGN-REF §2.1, PRD §13.
 *
 * The single exception to CLAUDE.md non-negotiable #5: this page opts back into
 * indexing, both here (meta) and in `next.config.ts` (header). Everything else
 * in the app stays noindex by default, so a new route is private unless someone
 * deliberately adds it to `INDEXABLE_ROUTES`.
 *
 * The metadata below is fixed text. It never contains, summarises, or is derived
 * from anybody's curhat — that would leak content into link previews and crawler
 * caches even with the rest of the app locked down.
 */
export const metadata: Metadata = {
  title: 'CURHAT DONG — tempat cerita yang mau dengerin',
  description:
    'Kadang kita nggak butuh solusi. Kita cuma butuh didengar. Curhat anonim, listener manusia, dan DONG AI yang nemenin. 18+.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'CURHAT DONG',
    title: 'CURHAT DONG — tempat cerita yang mau dengerin',
    description: 'Kadang kita nggak butuh solusi. Kita cuma butuh didengar.',
  },
};

export default function LandingPage() {
  return (
    <main className="px-[var(--spacing-gutter)] pt-6">
      <LandingNavbar />
      <LandingHero />
      <LandingFeatures />
      <LandingValueProps />
      <LandingPreviewFeed />
      <LandingFooter />
    </main>
  );
}
