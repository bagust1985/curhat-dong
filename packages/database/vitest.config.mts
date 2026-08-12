import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Database tests share one schema; running files in parallel would let
    // them delete each other's fixtures.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
