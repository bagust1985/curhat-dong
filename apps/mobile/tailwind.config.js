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
 * real colours here. `lib/tokens.test.ts` reads the web file and fails if the two ever drift.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // --- Dark (the default on mobile; see lib/theme.ts) ---
        bg: '#1a1020',
        surface: '#251729',
        'surface-alt': '#33203a',
        border: '#4a2c46',
        text: '#f7e9f0',
        muted: '#c9a9bb',
        primary: '#ff86bb',
        'primary-fg': '#1a1020',
        brand: '#ff9fca',
        'accent-lavender': '#c4b0ff',
        'accent-amber': '#ffc978',
        'accent-fg': '#1a1020',
        'tint-pink': '#3d2138',
        'tint-lavender': '#2f2650',
        'tint-amber': '#3d3020',
        'tint-rose': '#452133',
        danger: '#ff9d80',
        'danger-fg': '#1a1020',
        focus: '#ff86bb',
      },
      borderRadius: {
        // 20px cards and pill actions, matching RADII on the web (E18-T01).
        curhat: '20px',
        action: '999px',
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
