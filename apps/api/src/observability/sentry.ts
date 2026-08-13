import * as Sentry from '@sentry/node';
import { sentryOptions } from '@curhat/observability';

/**
 * Sentry for the API and the worker — E17-T05.
 *
 * Called before anything else in both entrypoints: an SDK initialised after the
 * framework has registered its own error handlers reports nothing while looking
 * like it works.
 *
 * The options — `beforeSend` included — come from `@curhat/observability`, so
 * there is no way to start this app without the scrubbing. That is why it is a
 * shared function and not a config object each app assembles.
 */
export function initSentry(processName: 'api' | 'worker'): void {
  const shared = sentryOptions({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['NODE_ENV'] ?? 'development',
    release: process.env['IMAGE_TAG'],
  });

  Sentry.init({
    // Optional keys are spread conditionally: `exactOptionalPropertyTypes`
    // treats `release: undefined` as different from an absent key, and the SDK
    // reads an explicit undefined as a value.
    ...(shared.dsn ? { dsn: shared.dsn } : {}),
    ...(shared.release ? { release: shared.release } : {}),
    environment: shared.environment,
    enabled: shared.enabled,
    tracesSampleRate: shared.tracesSampleRate,
    sendDefaultPii: shared.sendDefaultPii,
    beforeSend: shared.beforeSend as never,
    beforeBreadcrumb: shared.beforeBreadcrumb as never,
    // Distinguishes the two processes sharing one image and one DSN. Without
    // it a worker crash at 03:00 is indistinguishable from an API crash.
    initialScope: { tags: { process: processName } },
  });
}
