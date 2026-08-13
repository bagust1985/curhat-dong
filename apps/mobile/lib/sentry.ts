import * as Sentry from '@sentry/react-native';
import { sentryOptions } from '@curhat/observability';

/**
 * Sentry on the device — E17-T05, E16.
 *
 * Same shared options as every other app, so a curhat cannot be scrubbed on the
 * server and shipped from the phone.
 *
 * Two things left off on purpose:
 *
 *  - **no Session Replay.** It records the screen, and on this product the
 *    screen is somebody's curhat;
 *  - **no `attachScreenshot`.** Same reason, more directly.
 */
export function initSentry(): void {
  const shared = sentryOptions({
    dsn: process.env['EXPO_PUBLIC_SENTRY_DSN'],
    environment: __DEV__ ? 'development' : 'production',
  });

  Sentry.init({
    ...(shared.dsn ? { dsn: shared.dsn } : {}),
    environment: shared.environment,
    enabled: shared.enabled,
    tracesSampleRate: shared.tracesSampleRate,
    sendDefaultPii: shared.sendDefaultPii,
    beforeSend: shared.beforeSend as never,
    beforeBreadcrumb: shared.beforeBreadcrumb as never,
    // The default handler would capture the message of every unhandled promise
    // rejection, and on this app those messages have carried request bodies.
    // `beforeSend` still masks them; this keeps the volume sane.
    enableCaptureFailedRequests: false,
  });
}
