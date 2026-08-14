import type { MetadataRoute } from 'next';

/**
 * Web app manifest — E18-T01.
 *
 * There was none before, which meant an installed shortcut had no name and no
 * icon, and `public/sw.js` was already pointing push notifications at
 * `/icon-192.png` and `/badge-72.png` — two files that did not exist. Both are
 * generated from `docs/curhatdong_logo_v2.png` and now do.
 *
 * `background_color` and `theme_color` mirror `--color-bg` in globals.css, so
 * the splash screen is the same ground as the app rather than a white flash
 * before it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CURHAT DONG',
    short_name: 'Curhat Dong',
    description: 'Kadang kita nggak butuh solusi. Kita cuma butuh didengar.',
    lang: 'id',
    start_url: '/home',
    // Landing is the only indexable route, but an installed app should open
    // where the person actually goes.
    scope: '/',
    display: 'standalone',
    background_color: '#fff5f8',
    theme_color: '#fff5f8',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
