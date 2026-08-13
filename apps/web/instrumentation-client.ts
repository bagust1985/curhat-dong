import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@curhat/observability';

/**
 * Browser-side Sentry — E17-T05.
 *
 * The browser is where the risk is highest: a client error can carry the exact
 * text somebody is in the middle of typing. Same shared options as the server,
 * and `replaysSessionSampleRate` is deliberately absent — Session Replay records
 * the screen, and on this product the screen is somebody's curhat.
 */
Sentry.init({
  ...(() => {
    const shared = sentryOptions({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
    });
    return {
      ...(shared.dsn ? { dsn: shared.dsn } : {}),
      environment: shared.environment,
      enabled: shared.enabled,
      tracesSampleRate: shared.tracesSampleRate,
      sendDefaultPii: shared.sendDefaultPii,
      beforeSend: shared.beforeSend as never,
      beforeBreadcrumb: shared.beforeBreadcrumb as never,
    };
  })(),
});
