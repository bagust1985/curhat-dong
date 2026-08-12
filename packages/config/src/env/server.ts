import { parseEnv } from './parse.js';
import { serverEnvSchema, type ServerEnv } from './schema.js';

export { EnvValidationError } from './parse.js';
export { serverEnvSchema, type ServerEnv } from './schema.js';

/**
 * Server-only environment access.
 *
 * TECH-SPEC §7.2 forbids exposing server secrets to the client. ESLint blocks
 * importing this module from apps/web and apps/admin, and the guard below
 * catches anything that slips past the linter at runtime.
 */
function assertServerOnly(): void {
  // Checked via globalThis so this module does not need the DOM lib, which
  // would otherwise pull browser globals into every server package.
  const maybeBrowser = globalThis as { window?: unknown };
  if (typeof maybeBrowser.window !== 'undefined') {
    throw new Error(
      '@curhat/config/env/server was imported in a browser context. ' +
        'Server secrets must never reach the client — use @curhat/config/env/client instead.',
    );
  }
}

let cached: ServerEnv | undefined;

/**
 * Parses and caches server env. Throws immediately on a missing or malformed
 * variable so the process dies at boot rather than at the first request that
 * happens to touch the bad value.
 */
export function loadServerEnv(source: Record<string, unknown> = process.env): ServerEnv {
  assertServerOnly();
  if (cached) return cached;
  cached = parseEnv('server', serverEnvSchema, source);
  return cached;
}

/** Test seam — resets the memoised value. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
