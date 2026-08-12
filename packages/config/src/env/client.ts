import { parseEnv } from './parse.js';
import { clientEnvSchema, type ClientEnv } from './schema.js';

export { clientEnvSchema, type ClientEnv } from './schema.js';

/**
 * Client-visible configuration — safe to ship in a browser bundle.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time, so the keys are listed
 * explicitly rather than spreading process.env; a spread would not be
 * statically replaced and would resolve to undefined in the browser.
 */
export function loadClientEnv(
  source: Record<string, unknown> = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ANDROID_APK_URL: process.env.NEXT_PUBLIC_ANDROID_APK_URL,
  },
): ClientEnv {
  return parseEnv('client', clientEnvSchema, source);
}
