/**
 * Sentry scrubbing — E17-T05. CLAUDE.md non-negotiable #3, TECH-SPEC §10.
 *
 * ## What this is defending
 *
 * An error report is the one place where private data leaves the system by
 * accident. Nobody decides to send somebody's curhat to a third party; it
 * arrives as a request body attached to a 500, as a breadcrumb from an HTTP
 * client, or inside an exception message that interpolated the thing it was
 * validating.
 *
 * So this scrubs by **shape, not by field name**. A denylist of keys only
 * catches the fields somebody remembered; a request body on a post endpoint is
 * curhat regardless of what the field is called this month.
 *
 * ## The rules
 *
 *  1. request bodies are dropped entirely on content routes, and reduced to
 *     their key names elsewhere;
 *  2. known-sensitive keys are redacted anywhere they appear, at any depth;
 *  3. headers that carry credentials are redacted;
 *  4. anything that looks like an email, a phone number, a JWT or a push token
 *     is masked inside free text — including inside exception messages;
 *  5. query strings are stripped of values, keeping only the parameter names.
 *
 * The result is an event that still says *where* something broke and *what*
 * kind of data was involved, without carrying the data.
 */

export const REDACTED = '[dihapus]';

/**
 * Keys whose value is never useful in a report.
 *
 * Matched case-insensitively and as a substring, so `pushTokenEncrypted`,
 * `push_token` and `PushToken` are all covered without listing each spelling.
 */
export const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'email',
  'phone',
  'body',
  'content',
  'message',
  'excerpt',
  'transcript',
  'note',
  'reason',
  'alias',
  'ip',
  'riskscore',
  'trustscore',
];

/**
 * Routes whose request body is, by definition, somebody's private writing.
 *
 * Listed as prefixes because ids appear in the path. A route not on this list
 * still has its body reduced to key names — this list is about dropping even
 * that.
 */
export const CONTENT_ROUTES: readonly string[] = [
  '/v1/posts',
  '/v1/comments',
  '/v1/rooms',
  '/v1/ai',
  '/v1/reports',
  '/v1/appeals',
  '/v1/me/export',
];

const EMAIL = /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_ID = /\b(?:\+62|62|0)8\d{2}[-\s]?\d{3,4}[-\s]?\d{3,5}\b/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const EXPO_PUSH_TOKEN = /ExponentPushToken\[[^\]]+\]/g;
const BEARER = /Bearer\s+[\w.\-+/=]+/gi;
const LONG_HEX = /\b[a-f0-9]{32,}\b/gi;

/**
 * Quoted runs inside an error message.
 *
 * The single most common way a curhat reaches an error report: a validator
 * interpolates the value it is rejecting — `body gagal divalidasi: "…"`. The
 * reason survives, the quoted content does not.
 *
 * 24 characters is the threshold. Short quoted strings in error messages are
 * field names and enum values ("mood", "butuh_saran"), and masking those would
 * make the message useless.
 */
const QUOTED_RUN = /(["'`])([^"'`]{24,})\1/g;

/** Masks anything that looks like a credential or an identity inside free text. */
export function maskText(value: string): string {
  return value
    .replace(QUOTED_RUN, (_match, quote: string) => `${quote}${REDACTED}${quote}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(EXPO_PUSH_TOKEN, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(PHONE_ID, REDACTED)
    .replace(LONG_HEX, REDACTED);
}

export function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalised.includes(pattern.replace(/[_-]/g, '')),
  );
}

export function isContentRoute(path: string | undefined): boolean {
  if (!path) return false;
  return CONTENT_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));
}

/**
 * Walks any structure and redacts as it goes.
 *
 * Depth-limited because a Sentry event can contain a cyclic or enormous object,
 * and a scrubber that hangs is a scrubber that gets switched off.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return maskText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => scrubValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : scrubValue(entry, depth + 1);
    }
    return output;
  }

  return REDACTED;
}

// ---------------------------------------------------------------------------
// The Sentry event shape, kept minimal on purpose.
//
// Typed structurally rather than imported from `@sentry/*` so this package has
// no runtime dependency on the SDK and can be unit-tested without one. The
// fields below are the ones that carry data; anything else passes through.
// ---------------------------------------------------------------------------

export interface ScrubbableRequest {
  url?: string;
  method?: string;
  data?: unknown;
  query_string?: string | Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string> | string;
}

export interface ScrubbableBreadcrumb {
  type?: string;
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ScrubbableEvent {
  message?: string;
  request?: ScrubbableRequest;
  breadcrumbs?: ScrubbableBreadcrumb[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, string>;
  user?: Record<string, unknown>;
  exception?: {
    values?: Array<{ type?: string; value?: string; stacktrace?: unknown }>;
  };
}

function pathOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, 'http://placeholder.invalid').pathname;
  } catch {
    return url.split('?')[0];
  }
}

/** Keeps parameter names, drops every value. */
function scrubQuery(
  query: ScrubbableRequest['query_string'],
  url: string | undefined,
): string | undefined {
  // Sentry puts the query in `query_string` or leaves it on the URL depending
  // on the SDK. Stripping the URL to its path would otherwise lose the
  // parameter names, which are often the difference between a reproducible
  // report and a shrug.
  const source = query ?? url?.split('?')[1];
  if (!source) return undefined;

  const names =
    typeof source === 'string'
      ? source
          .replace(/^\?/, '')
          .split('&')
          .filter(Boolean)
          .map((pair) => pair.split('=')[0])
      : Object.keys(source);

  return names.length > 0 ? names.map((name) => `${name}=${REDACTED}`).join('&') : undefined;
}

/**
 * The `beforeSend` hook.
 *
 * Returns a new event; never mutates the input, because Sentry reuses the
 * object for its own bookkeeping and a mutation here has surfaced as a
 * scrubbed field reappearing in a later event.
 */
export function scrubEvent(event: ScrubbableEvent): ScrubbableEvent {
  const scrubbed: ScrubbableEvent = { ...event };

  if (event.message) scrubbed.message = maskText(event.message);

  if (event.request) {
    const path = pathOf(event.request.url);
    scrubbed.request = {
      ...event.request,
      // The URL keeps its path — which endpoint broke is the whole value of the
      // report — and loses its query.
      ...(event.request.url ? { url: path ?? event.request.url } : {}),
      ...(scrubQuery(event.request.query_string, event.request.url)
        ? {
            query_string: scrubQuery(
              event.request.query_string,
              event.request.url,
            ) as string,
          }
        : {}),
      headers: Object.fromEntries(
        Object.entries(event.request.headers ?? {}).map(([key, value]) => [
          key,
          isSensitiveKey(key) ? REDACTED : maskText(String(value)),
        ]),
      ),
      cookies: REDACTED,
      data: isContentRoute(path)
        ? // A post body on a content route is a curhat. There is no version of
          // it that is safe to send, so the report keeps only the fact that a
          // body existed.
          REDACTED
        : bodyKeysOnly(event.request.data),
    };
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      ...(crumb.message ? { message: maskText(crumb.message) } : {}),
      ...(crumb.data ? { data: scrubValue(crumb.data) as Record<string, unknown> } : {}),
    }));
  }

  if (event.extra) scrubbed.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) scrubbed.contexts = scrubValue(event.contexts) as Record<string, unknown>;
  if (event.tags) scrubbed.tags = scrubValue(event.tags) as Record<string, string>;

  if (event.user) {
    // The user id stays — it is how an error is traced to a report — and
    // everything else about them goes.
    scrubbed.user = {
      ...(typeof event.user['id'] === 'string' ? { id: event.user['id'] } : {}),
    };
  }

  if (event.exception?.values) {
    scrubbed.exception = {
      values: event.exception.values.map((entry) => ({
        ...entry,
        ...(entry.value ? { value: maskText(entry.value) } : {}),
      })),
    };
  }

  return scrubbed;
}

/**
 * Reduces a body to the shape of its keys.
 *
 * Off the content routes a body is usually a settings patch or a filter, where
 * "which fields were present" is what makes an error reproducible and the values
 * add nothing worth the risk.
 */
export function bodyKeysOnly(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return REDACTED;
  if (Array.isArray(data)) return `[array(${data.length})]`;
  if (typeof data !== 'object') return REDACTED;

  return Object.fromEntries(Object.keys(data as Record<string, unknown>).map((key) => [key, REDACTED]));
}

// ---------------------------------------------------------------------------
// The options every Sentry SDK in this repo is initialised with — E17-T05.
// ---------------------------------------------------------------------------

export interface SentryInitOptions {
  dsn: string | undefined;
  environment: string;
  release?: string | undefined;
  /** Server, browser and device all get the same rules; only the SDK differs. */
  tracesSampleRate?: number;
}

export interface SharedSentryOptions {
  dsn: string | undefined;
  environment: string;
  release?: string | undefined;
  enabled: boolean;
  tracesSampleRate: number;
  sendDefaultPii: false;
  beforeSend: (event: ScrubbableEvent) => ScrubbableEvent;
  beforeBreadcrumb: (crumb: ScrubbableBreadcrumb) => ScrubbableBreadcrumb | null;
}

/**
 * Builds the options object each app passes to `Sentry.init`.
 *
 * Shared so no app can be initialised *without* the scrubbing: forgetting
 * `beforeSend` in one of five call sites is exactly the mistake that ends with
 * a curhat in a third-party dashboard, and it would look like nothing at all
 * until it happened.
 *
 * `enabled: false` when there is no DSN, rather than initialising a client that
 * silently drops everything — a disabled SDK that looks configured is worse
 * than an obviously absent one.
 */
export function sentryOptions(options: SentryInitOptions): SharedSentryOptions {
  return {
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    enabled: Boolean(options.dsn),
    // Low by default. Traces carry URLs and timings from every request, and the
    // value of a 100% sample here is far below the cost of the extra surface.
    tracesSampleRate: options.tracesSampleRate ?? 0.1,
    // Never attach IP addresses, cookies or user agents automatically.
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => {
      // A console breadcrumb is whatever somebody passed to console.log, which
      // on this product has been a post body more than once. Dropped outright
      // rather than scrubbed.
      if (crumb.category === 'console') return null;
      return {
        ...crumb,
        ...(crumb.message ? { message: maskText(crumb.message) } : {}),
        ...(crumb.data ? { data: scrubValue(crumb.data) as Record<string, unknown> } : {}),
      };
    },
  };
}
