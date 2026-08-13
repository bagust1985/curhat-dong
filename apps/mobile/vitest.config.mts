import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * `node`, not a React Native renderer — E16.
     *
     * React Native components need a native runtime or jest-expo's transform
     * chain to render at all, so what is unit-tested here is the layer where
     * the product rules live: token storage, refresh behaviour, deep-link
     * allow-listing, quiet hours, draft handling and notification payloads.
     *
     * Screen rendering is verified by `expo export` (it fails the build on a
     * bad import or route) and, for real, on a device. `docs/E16-MOBILE.md`
     * lists exactly what is still device-only.
     */
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts'],
  },
});
