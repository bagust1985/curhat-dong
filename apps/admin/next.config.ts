import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
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
