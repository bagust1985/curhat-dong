import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@curhat/observability';

/**
 * Server-side Sentry — E17-T05.
 *
 * Next calls `register` once per server process, before any route runs. The
 * options come from `@curhat/observability` so the scrubbing cannot be omitted
 * here and present elsewhere.
 */
export function register(): void {
  const shared = sentryOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
  });

  Sentry.init({
    ...(shared.dsn ? { dsn: shared.dsn } : {}),
    environment: shared.environment,
    enabled: shared.enabled,
    tracesSampleRate: shared.tracesSampleRate,
    sendDefaultPii: shared.sendDefaultPii,
    beforeSend: shared.beforeSend as never,
    beforeBreadcrumb: shared.beforeBreadcrumb as never,
  });
}

export const onRequestError = Sentry.captureRequestError;
