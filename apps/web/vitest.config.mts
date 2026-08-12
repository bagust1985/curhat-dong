import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * `jsdom` rather than `node` — E15-T02..T04.
     *
     * Accessibility is an acceptance criterion here (PRD §23.1), and the only
     * honest way to assert "this icon has a screen reader label" is to render it
     * and query by accessible name. Grepping the source for `aria-label` proves
     * the attribute exists, not that it reaches the element a reader lands on.
     */
    environment: 'jsdom',
    globals: true,
    include: ['lib/**/*.test.ts', 'components/**/*.test.{ts,tsx}'],
  },
});
