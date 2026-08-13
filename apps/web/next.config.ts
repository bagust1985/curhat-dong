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
        /*
         * CLAUDE.md non-negotiable #5: nothing under the app is indexable.
         *
         * `/:path+` is one-or-more segments, so it covers every route except the
         * landing page at `/` — which opts into indexing in `app/page.tsx`
         * (E15-T05, PRD §13). The exception is expressed by *not matching* `/`
         * rather than by a second rule setting `index`: when two header rules
         * match the same path, the crawler can end up seeing both values, and a
         * stray `noindex` wins over an `index`. Excluding the path is the only
         * version with one possible outcome.
         *
         * The important half is that this is still a catch-all: a route added
         * tomorrow is noindex without anyone remembering to make it so.
         */
        source: '/:path+',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default config;
