import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string, entry: string) => resolve(here, '../../packages', name, entry);

export default defineConfig({
  resolve: {
    // Point workspace packages at their TypeScript sources.
    //
    // Their published entry points are compiled CommonJS (the generated Prisma
    // client is CJS, and NestJS runs as CJS), which Vitest cannot load as ESM.
    // Resolving to source also means a test never runs against a stale dist.
    alias: {
      '@curhat/database': pkg('database', 'src/index.ts'),
      '@curhat/auth': pkg('auth', 'src/index.ts'),
      '@curhat/notifications': pkg('notifications', 'src/index.ts'),
      '@curhat/types': pkg('types', 'src/index.ts'),
      '@curhat/config/env/server': pkg('config', 'src/env/server.ts'),
      '@curhat/config/env/client': pkg('config', 'src/env/client.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    // The security suite boots a real app against a shared database; running
    // files in parallel would let them revoke each other's sessions.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
