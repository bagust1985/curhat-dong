import type { AiProviderName } from './types.js';

/**
 * Normalised failure shapes — E08-T02.
 *
 * Every provider maps its own error vocabulary onto this set, because the
 * safety fallback (E07-T05) decides publish-vs-HOLD from the *kind* of failure.
 * If each adapter leaked its own error type, that decision would silently
 * depend on which provider happened to be configured.
 */
export type AiErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'bad_request'
  | 'invalid_response'
  | 'server_error'
  | 'not_configured'
  | 'circuit_open';

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set<AiErrorKind>([
  'timeout',
  'rate_limit',
  'server_error',
]);

export class AiProviderError extends Error {
  readonly kind: AiErrorKind;
  readonly provider: AiProviderName | 'gateway';
  readonly status: number | undefined;

  constructor(
    kind: AiErrorKind,
    provider: AiProviderName | 'gateway',
    message?: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message ?? `AI provider ${provider} failed: ${kind}`);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.provider = provider;
    this.status = options?.status;
    if (options?.cause !== undefined) this.cause = options.cause;
  }

  /**
   * Whether another attempt could plausibly succeed.
   *
   * `invalid_response` is deliberately not retryable: a model that answered
   * with unparseable output will usually do it again, and each retry costs
   * real money (E08-T08).
   */
  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}

/** Maps an HTTP status onto the normalised vocabulary. */
export function kindForStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server_error';
  return 'bad_request';
}
