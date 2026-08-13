/**
 * Tailwind for NativeWind — E16-T01. TECH-SPEC §1.2.
 *
 * **Tailwind 3.4.x, and only in this package.** NativeWind 4 compiles Tailwind
 * 3 syntax; the web and admin apps are on Tailwind 4. Forcing one version
 * across the workspace would mean either breaking NativeWind or holding the web
 * apps back, so `apps/mobile` declares its own devDependency and is deliberately
 * excluded from the catalog entry.
 *
 * The palette repeats the web tokens rather than importing `globals.css`:
 * React Native has no CSS custom properties, so the values have to exist as
 * real colours here. `lib/tokens.test.ts` fails if the two ever drift.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // --- Dark (the default on mobile; see lib/theme.ts) ---
        bg: '#12101f',
        surface: '#1b1830',
        'surface-alt': '#252140',
        border: '#332d52',
        text: '#edeafb',
        muted: '#b5aed2',
        primary: '#b9a6ff',
        'primary-fg': '#12101f',
        brand: '#b9a6ff',
        'accent-pink': '#ff9fb4',
        'accent-amber': '#ffc978',
        'accent-fg': '#12101f',
        danger: '#ffb4ab',
        'danger-fg': '#12101f',
        focus: '#b9a6ff',
      },
      borderRadius: {
        curhat: '16px',
        action: '20px',
        chip: '999px',
      },
      spacing: {
        // PRD §23.1 — the floor for anything tappable.
        touch: '44px',
        gutter: '20px',
      },
    },
  },
  plugins: [],
};
