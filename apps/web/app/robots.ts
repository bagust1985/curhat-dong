import type { MetadataRoute } from 'next';

import { INDEXABLE_ROUTES } from '../lib/landing';

/**
 * robots.txt — E05-T11 scope, completed in E15-T05 once there was a page worth
 * allowing. PRD §13.
 *
 * Written as "deny everything, then allow exactly the landing page" rather than
 * listing what to block. A blocklist has to be updated every time a route is
 * added, and the cost of forgetting is somebody's curhat in a search result.
 *
 * `Allow: /$` matches only the root path — the `$` anchor is what stops it from
 * also allowing `/feed`. It is honoured by Google and Bing; crawlers that ignore
 * it fall back to `Disallow: /`, which errs in the safe direction.
 *
 * This file is a request, not a control. The enforcement is the `X-Robots-Tag`
 * header in `next.config.ts` plus the per-page metadata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: INDEXABLE_ROUTES.map((route) => (route === '/' ? '/$' : route)),
        disallow: '/',
      },
    ],
  };
}
