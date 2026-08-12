import { z } from 'zod';

/**
 * Environment variable schemas — TECH-SPEC §12.
 *
 * Two rules drive the split below:
 *  - TECH-SPEC §7.2: server secrets must never be exposed via NEXT_PUBLIC_*.
 *  - CLAUDE.md non-negotiable #4: nothing identifying reaches the client.
 *
 * Everything in `serverEnvSchema` is assumed secret unless it also appears in
 * `clientEnvSchema`. The two schemas share no keys by construction.
 */

const url = z.string().url();
const nonEmpty = z.string().min(1);

/** Secrets must be long enough to be worth having. */
const secret = z.string().min(32, 'must be at least 32 characters');

export const nodeEnvSchema = z.enum(['development', 'test', 'production']);

export const serverEnvSchema = z.object({
  // --- APP ---
  NODE_ENV: nodeEnvSchema.default('development'),
  APP_URL: url,
  API_URL: url,
  ADMIN_URL: url,

  // --- DATABASE ---
  DATABASE_URL: z.string().startsWith('postgres', 'must be a postgres:// URL'),

  // --- REDIS ---
  REDIS_URL: z.string().startsWith('redis', 'must be a redis:// URL'),

  // --- AUTH ---
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  TOKEN_ENCRYPTION_KEY: secret,

  // --- GOOGLE ---
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,

  // --- EMAIL ---
  EMAIL_PROVIDER: z.enum(['resend', 'postmark', 'ses', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email(),

  // --- BOT PROTECTION ---
  TURNSTILE_SECRET_KEY: nonEmpty,

  // --- OBJECT STORAGE ---
  S3_ENDPOINT: url,
  S3_REGION: nonEmpty,
  S3_BUCKET: nonEmpty,
  S3_ACCESS_KEY: nonEmpty,
  S3_SECRET_KEY: nonEmpty,

  // --- AI ---
  AI_DEFAULT_PROVIDER: z.enum(['anthropic', 'openai', 'local']).default('anthropic'),
  /**
   * Used when the primary provider is exhausted or its circuit is open
   * (E08-T08). Left unset means "no fallback" — the gateway then surfaces a
   * timeout, which the safety engine already knows how to handle.
   */
  AI_FALLBACK_PROVIDER: z.enum(['anthropic', 'openai', 'local']).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  /** Self-hosted, OpenAI-compatible endpoint. */
  AI_LOCAL_BASE_URL: z.string().optional(),
  AI_LOCAL_API_KEY: z.string().optional(),
  /** Daily spend ceiling in USD. PRD §10 alerts at 70% / 90% of this. */
  AI_DAILY_BUDGET: z.coerce.number().positive(),

  // --- EXPO ---
  EXPO_ACCESS_TOKEN: z.string().optional(),
  EXPO_PROJECT_ID: z.string().optional(),

  // --- SENTRY ---
  SENTRY_DSN: z.string().optional(),

  // --- OPS ---
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

/**
 * Client-visible configuration. Every key is NEXT_PUBLIC_* and every value is
 * safe to ship in a JS bundle that anyone can read.
 *
 * If you are about to add a key here, ask: "am I fine with this being printed
 * on a billboard?" If not, it belongs in serverEnvSchema.
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: url,
  NEXT_PUBLIC_API_URL: url,
  /** Turnstile *site* key is public by design; the secret key is not. */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: nonEmpty,
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type NodeEnv = z.infer<typeof nodeEnvSchema>;
