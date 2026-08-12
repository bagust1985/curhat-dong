import { z } from 'zod';

const consentTypeSchema = z.enum(['tos_privacy', 'sensitive_processing', 'analytics']);

export const onboardingSchema = z.object({
  /**
   * Self-declared 18+ (PRD §25.5). The client sends the answer, not a birth
   * date: storing a date we cannot verify adds personal data without adding
   * any assurance.
   */
  isAdult: z.boolean(),

  /**
   * Every consent the user was shown, granted or not.
   *
   * Refusals are recorded too — "they said no" is as much a compliance record
   * as "they said yes" (PRD §25.3).
   */
  consents: z
    .array(z.object({ consentType: consentTypeSchema, granted: z.boolean() }))
    .min(1)
    .max(3),

  /** Omitted means "generate one for me" (DESIGN-REF §2.3 step 4). */
  alias: z.string().min(3).max(24).optional(),
  avatar: z.string().max(64).optional(),

  /** Steps 2 and 3 are skippable (DESIGN-REF §2.3). */
  reason: z.enum(['cerita', 'mendengarkan', 'keduanya', 'lihat_lihat']).optional(),
  topics: z.array(z.string().max(48)).max(15).optional(),

  deviceId: z.string().max(128).optional(),
});

export const consentUpdateSchema = z.object({
  consents: z
    .array(z.object({ consentType: consentTypeSchema, granted: z.boolean() }))
    .min(1)
    .max(3),
});

export const notificationSettingsSchema = z.object({
  /**
   * A subset is allowed — `partialRecord`, not `record`.
   *
   * Zod 4's `z.record` over an enum key is exhaustive: it demands all six
   * categories on every call. That contradicts what the service does with the
   * value (it merges over the current settings) and would force a client
   * turning off one toggle to send the other five back, which is how a stale
   * screen quietly reverts a setting the user changed elsewhere.
   */
  perTypeToggles: z
    .partialRecord(
      z.enum(['social', 'response', 'listener', 'ai', 'safety', 'account']),
      z.object({ push: z.boolean(), inApp: z.boolean() }),
    )
    .optional(),
  quietHoursEnabled: z.boolean().optional(),
  feltHeardPromptEnabled: z.boolean().optional(),
});

export const deleteAccountSchema = z.object({
  mode: z.enum(['purge', 'anonymize']),
  /**
   * Typed confirmation.
   *
   * Required because `anonymize` cannot be undone, and a single tap is too
   * little friction for an action with no way back.
   */
  confirmation: z.literal('HAPUS AKUN'),
});

export const aliasCheckSchema = z.object({
  alias: z.string().min(1).max(24),
});

export type OnboardingDto = z.infer<typeof onboardingSchema>;
export type ConsentUpdateDto = z.infer<typeof consentUpdateSchema>;
export type NotificationSettingsDto = z.infer<typeof notificationSettingsSchema>;
export type DeleteAccountDto = z.infer<typeof deleteAccountSchema>;
export type AliasCheckDto = z.infer<typeof aliasCheckSchema>;
