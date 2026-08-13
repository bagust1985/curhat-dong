/**
 * API contract — TECH-SPEC §3.
 *
 * Every response uses the same envelope, and every error carries a stable
 * `code`. Clients branch on `code`, never on `message`: messages are Indonesian
 * user-facing copy and are expected to change.
 */

export interface ApiMeta {
  /** Cursor for the next page, or null when the collection is exhausted. */
  nextCursor?: string | null;
  [key: string]: unknown;
}

export interface ApiError {
  code: ErrorCode;
  /** Indonesian, user-facing, safe to display. Never a stack trace. */
  message: string;
  /** Field-level detail for validation failures. */
  details?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  data: T | null;
  meta: ApiMeta;
  error: ApiError | null;
}

// ---------------------------------------------------------------------------
// Stable error codes
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  // Generic
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',

  // Auth — deliberately generic so they cannot be used to enumerate accounts
  // (TECH-SPEC §3.1).
  'AUTH_OTP_INVALID',
  'AUTH_OTP_EXPIRED',
  'AUTH_OTP_TOO_MANY_ATTEMPTS',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_REFRESH_REUSE_DETECTED',
  'AUTH_GOOGLE_TOKEN_INVALID',
  'AUTH_TURNSTILE_REQUIRED',
  'AUTH_TURNSTILE_INVALID',
  // One code for wrong password, unknown email AND account-without-password:
  // three different truths, one answer, so the login form cannot be used to
  // ask "does this address have an account here?".
  'AUTH_CREDENTIALS_INVALID',
  // Safe to be specific — it describes the password just typed, not the account.
  'AUTH_PASSWORD_WEAK',

  // Onboarding & consent
  'CONSENT_REQUIRED',
  'AGE_GATE_REJECTED',
  'AGE_GATE_COOLDOWN',
  'ALIAS_TAKEN',
  'ALIAS_INVALID',

  // Content
  'POST_NOT_PUBLISHED',
  'POST_HELD_FOR_REVIEW',
  'COMMENTS_LOCKED',
  'COMMENT_NESTING_TOO_DEEP',
  'REACTION_DUPLICATE',

  // Safety
  'CONTENT_BLOCKED',
  'USER_BLOCKED',
  'USER_SUSPENDED',
  'USER_MUTED',

  // Appeals — PRD §15.4
  'APPEAL_WINDOW_EXPIRED',
  'APPEAL_ALREADY_SUBMITTED',
  'APPEAL_ACTION_NOT_APPEALABLE',
  'APPEAL_REVIEWER_CONFLICT',

  // AI
  'AI_QUOTA_EXCEEDED',
  'AI_BUDGET_EXCEEDED',
  'AI_PROVIDER_UNAVAILABLE',

  // Admin — E14
  'ADMIN_MFA_REQUIRED',
  'ADMIN_MFA_INVALID',
  'ADMIN_MFA_LOCKED',
  'ADMIN_REAUTH_REQUIRED',
  'ADMIN_CASE_REQUIRED',

  // Listener & rooms
  'LISTENER_GUIDELINES_NOT_ACCEPTED',
  'LISTENER_CAPACITY_REACHED',
  'LISTENER_DAILY_CAP_REACHED',
  'LISTENER_COOLDOWN_ACTIVE',
  'LISTENER_REQUEST_ALREADY_ACTIVE',
  'MATCH_OFFER_EXPIRED',
  'MATCH_OFFER_ALREADY_TAKEN',
  'MATCH_NOT_FOUND',
  'ROOM_NOT_MEMBER',
  'ROOM_CLOSED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Cursor pagination everywhere (TECH-SPEC §8.2). Offset pagination drifts when
 * rows are inserted mid-scroll, which on a feed means duplicated or skipped
 * curhat.
 */
export interface CursorQuery {
  cursor?: string | null;
  limit?: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Supportive intervention — PRD §8, §15.1
// ---------------------------------------------------------------------------

export interface SupportResource {
  name: string;
  channel: 'phone' | 'chat' | 'whatsapp' | 'web';
  value: string;
  hours: string;
  language: string;
}

/**
 * Payload for the Level 3 supportive intervention screen.
 *
 * Note what is absent: no risk score, no safety level, no punitive action.
 * The user must never see how the system classified them (PRD §8,
 * CLAUDE.md non-negotiable #2).
 */
export interface SupportiveIntervention {
  message: string;
  resources: SupportResource[];
  /** True when no verified resource exists for the region (PRD §15.2). */
  usingFallback: boolean;
}

export function ok<T>(data: T, meta: ApiMeta = {}): ApiResponse<T> {
  return { data, meta, error: null };
}

export function fail(error: ApiError, meta: ApiMeta = {}): ApiResponse<never> {
  return { data: null, meta, error };
}
