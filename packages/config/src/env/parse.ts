import type { z } from 'zod';

/**
 * Turns a Zod failure into an error a human can act on.
 *
 * The point is to name the offending variables. A stack trace at boot tells
 * you something broke; this tells you which env var to go fix.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(scope: string, issues: readonly string[]) {
    super(
      `Invalid ${scope} environment configuration:\n` +
        issues.map((i) => `  - ${i}`).join('\n') +
        `\n\nCheck .env against .env.example.`,
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

export function parseEnv<T extends z.ZodType>(
  scope: string,
  schema: T,
  source: Record<string, unknown>,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      // Never echo the received value — it may be the secret itself.
      return `${key}: ${issue.message}`;
    });
    throw new EnvValidationError(scope, issues);
  }

  return result.data;
}
