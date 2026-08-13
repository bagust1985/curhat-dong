import { describe, expect, it } from 'vitest';

import {
  REDACTED,
  isContentRoute,
  isSensitiveKey,
  maskText,
  scrubEvent,
  scrubValue,
  type ScrubbableEvent,
} from './scrub';

/**
 * Sentry scrubbing — E17-T05. CLAUDE.md non-negotiable #3.
 *
 * The task says the scrubbing must be verified with a real error rather than
 * assumed from config. These reconstruct the events the SDK actually builds —
 * a failing POST with a body, an exception whose message interpolated the text
 * it was validating, an HTTP breadcrumb — and assert the curhat is not in them.
 */

const CURHAT =
  'Aku capek banget sama kerjaan dan nggak tau harus cerita ke siapa lagi soal ini.';

describe('a failing post request', () => {
  const event: ScrubbableEvent = {
    request: {
      url: 'https://api.curhatdong.com/v1/posts?draft=true&alias=senja',
      method: 'POST',
      data: {
        title: 'Capek banget',
        body: CURHAT,
        mood: 'capek',
        categorySlug: 'kerjaan',
      },
      headers: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.abcdef.ghijkl',
        'content-type': 'application/json',
        'user-agent': 'curhat-app/1.0',
      },
      cookies: { curhat_refresh: 'abc123' },
    },
    exception: {
      values: [
        {
          type: 'ValidationError',
          // The shape that leaks most often: the validator interpolated the
          // thing it was rejecting.
          value: `body gagal divalidasi: "${CURHAT}"`,
        },
      ],
    },
  };

  const scrubbed = scrubEvent(event);
  const serialised = JSON.stringify(scrubbed);

  it('does not carry the curhat anywhere in the event', () => {
    expect(serialised).not.toContain(CURHAT);
    expect(serialised).not.toContain('Capek banget');
    expect(serialised).not.toContain(CURHAT.slice(0, 20));
  });

  it('drops the body entirely on a content route', () => {
    // Not key names, not a truncation: the whole body.
    expect(scrubbed.request?.data).toBe(REDACTED);
  });

  it('keeps the token out of the headers and the URL', () => {
    expect(serialised).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(scrubbed.request?.headers?.['authorization']).toBe(REDACTED);
    expect(scrubbed.request?.cookies).toBe(REDACTED);
  });

  it('keeps enough to be useful: which endpoint, which method, which params', () => {
    // A report that says nothing is a report nobody can act on.
    expect(scrubbed.request?.url).toBe('/v1/posts');
    expect(scrubbed.request?.method).toBe('POST');
    expect(scrubbed.request?.query_string).toContain('draft=');
    expect(scrubbed.request?.headers?.['user-agent']).toBe('curhat-app/1.0');
    expect(scrubbed.exception?.values?.[0]?.type).toBe('ValidationError');
  });
});

describe('breadcrumbs', () => {
  it('masks what an HTTP client logged on the way to the error', () => {
    const scrubbed = scrubEvent({
      breadcrumbs: [
        {
          type: 'http',
          category: 'fetch',
          message: 'POST /v1/rooms/abc/messages',
          data: { body: CURHAT, status: 500, senderAlias: 'senja.tenang' },
        },
        {
          category: 'auth',
          message: 'login untuk seseorang@contoh.test berhasil',
        },
      ],
    });

    const serialised = JSON.stringify(scrubbed);
    expect(serialised).not.toContain(CURHAT);
    expect(serialised).not.toContain('seseorang@contoh.test');
    expect(serialised).not.toContain('senja.tenang');
    // The trail itself survives — which call, and that it 500ed.
    expect(scrubbed.breadcrumbs?.[0]?.data?.['status']).toBe(500);
  });
});

describe('free text anywhere', () => {
  it('masks emails, Indonesian phone numbers, JWTs and push tokens', () => {
    const masked = maskText(
      'hubungi seseorang@contoh.test atau 081234567890, token eyJhbGciOi.JIUzI1.NiJ9 ' +
        'dan ExponentPushToken[abc123]',
    );

    expect(masked).not.toContain('seseorang@contoh.test');
    expect(masked).not.toContain('081234567890');
    expect(masked).not.toContain('eyJhbGciOi');
    expect(masked).not.toContain('abc123');
  });

  it('leaves an ordinary sentence readable', () => {
    // Over-masking makes reports useless, which gets scrubbing switched off.
    expect(maskText('gagal menyimpan post karena koneksi database putus')).toBe(
      'gagal menyimpan post karena koneksi database putus',
    );
  });
});

describe('key matching', () => {
  it('catches the same field however it is spelled', () => {
    for (const key of [
      'pushToken',
      'push_token',
      'PUSH_TOKEN',
      'pushTokenEncrypted',
      'emailHash',
      'riskScore',
      'trust_score',
      'messageBody',
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it('leaves operational fields alone', () => {
    for (const key of ['status', 'durationMs', 'queue', 'jobName', 'attempt', 'statusCode']) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });
});

describe('nested structures', () => {
  it('redacts at any depth', () => {
    const scrubbed = scrubValue({
      job: 'analyze-post',
      payload: { post: { id: 'p1', body: CURHAT, author: { email: 'a@b.test' } } },
    });

    expect(JSON.stringify(scrubbed)).not.toContain(CURHAT);
    expect(JSON.stringify(scrubbed)).not.toContain('a@b.test');
    expect((scrubbed as Record<string, unknown>)['job']).toBe('analyze-post');
  });

  it('does not hang on a deeply nested object', () => {
    let nested: Record<string, unknown> = { body: CURHAT };
    for (let i = 0; i < 50; i += 1) nested = { level: nested };

    expect(JSON.stringify(scrubValue(nested))).not.toContain(CURHAT);
  });
});

describe('content routes', () => {
  it('covers every endpoint that carries private writing', () => {
    for (const path of [
      '/v1/posts',
      '/v1/posts/abc/comments',
      '/v1/rooms/abc/messages',
      '/v1/ai/conversations/abc/messages',
      '/v1/reports',
      '/v1/appeals',
    ]) {
      expect(isContentRoute(path), path).toBe(true);
    }
  });

  it('still reduces a body outside them to key names only', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://api.curhatdong.com/v1/me/notification-settings',
        method: 'PATCH',
        data: { perTypeToggles: { social: { push: false } }, quietHoursEnabled: true },
      },
    });

    // Which fields were sent is what makes the error reproducible; the values
    // are not worth the risk.
    expect(scrubbed.request?.data).toEqual({
      perTypeToggles: REDACTED,
      quietHoursEnabled: REDACTED,
    });
  });
});

describe('the user object', () => {
  it('keeps the id and drops everything else', () => {
    const scrubbed = scrubEvent({
      user: { id: 'user-1', email: 'a@b.test', alias: 'senja.tenang', ip_address: '1.2.3.4' },
    });

    expect(scrubbed.user).toEqual({ id: 'user-1' });
  });
});

describe('immutability', () => {
  it('never mutates the event Sentry handed over', () => {
    const event: ScrubbableEvent = {
      request: { url: 'https://api.curhatdong.com/v1/posts', data: { body: CURHAT } },
    };

    scrubEvent(event);

    // Sentry reuses the object; mutating it has surfaced as a scrubbed field
    // reappearing in a later event.
    expect((event.request?.data as Record<string, unknown>)['body']).toBe(CURHAT);
  });
});

describe('the shared init options', () => {
  it('always carries the scrubbing hooks', async () => {
    const { sentryOptions } = await import('./scrub');
    const options = sentryOptions({ dsn: 'https://x@y.ingest.sentry.io/1', environment: 'production' });

    // Forgetting beforeSend in one of five call sites is the mistake that ends
    // with a curhat in a third-party dashboard.
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeBreadcrumb).toBe('function');
    expect(options.sendDefaultPii).toBe(false);
  });

  it('scrubs through the hook, not only through the standalone function', async () => {
    const { sentryOptions } = await import('./scrub');
    const options = sentryOptions({ dsn: 'https://x@y.ingest.sentry.io/1', environment: 'production' });

    const scrubbed = options.beforeSend({
      request: { url: 'https://api.curhatdong.com/v1/posts', data: { body: CURHAT } },
    });

    expect(JSON.stringify(scrubbed)).not.toContain(CURHAT);
  });

  it('drops console breadcrumbs entirely', async () => {
    const { sentryOptions } = await import('./scrub');
    const options = sentryOptions({ dsn: 'https://x@y.ingest.sentry.io/1', environment: 'production' });

    // Whatever somebody passed to console.log — which on this product has been
    // a post body more than once.
    expect(options.beforeBreadcrumb({ category: 'console', message: CURHAT })).toBeNull();
  });

  it('stays disabled without a DSN instead of pretending to be configured', async () => {
    const { sentryOptions } = await import('./scrub');
    expect(sentryOptions({ dsn: undefined, environment: 'development' }).enabled).toBe(false);
  });
});
