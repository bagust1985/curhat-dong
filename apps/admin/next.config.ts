import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Traced standalone server for the Docker image (E17-T03): the runtime layer
  // gets the server and the modules it actually imports, not the whole
  // node_modules tree.
  output: 'standalone',
  // The trace has to start at the repo root or it misses the workspace
  // packages this app imports.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  // Workspace packages ship TypeScript-built CJS; Next compiles them in-app.
  transpilePackages: ['@curhat/types', '@curhat/config'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        // CLAUDE.md non-negotiable #5: nothing under the app is indexable.
        // The landing page opts back in explicitly (E15-T05).
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },
};

export default config;
