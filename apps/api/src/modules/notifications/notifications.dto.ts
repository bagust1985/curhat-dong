import { z } from 'zod';

/**
 * Device registration — E12-T01, TECH-SPEC §6.1.
 *
 * `pushProvider` is part of the request rather than inferred from the
 * platform: an Android build may be issued an Expo token today and an FCM
 * token after the migration, and the server should be told which it is holding
 * rather than guessing from `platform`.
 */
export const registerDeviceSchema = z.object({
  /** Stable per-installation id chosen by the client. */
  deviceId: z.string().min(8).max(128),
  platform: z.enum(['web', 'android', 'ios']),
  pushProvider: z.enum(['expo', 'fcm', 'webpush']),
  /**
   * The provider's token. For `webpush` this is the serialised
   * `PushSubscription` — endpoint plus keys — so the column stays
   * provider-shaped rather than FCM-shaped.
   */
  pushToken: z.string().min(8).max(4096),
  /** IANA zone; quiet hours are evaluated here, not on the server clock. */
  timezone: z.string().min(1).max(64).default('Asia/Jakarta'),
  quietHoursStart: z.coerce.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.coerce.number().int().min(0).max(23).optional(),
});

export const notificationQuerySchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export const markReadSchema = z.object({
  /** Omit to mark everything read. */
  ids: z.array(z.string().uuid()).max(100).optional(),
});

export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;
export type NotificationQueryDto = z.infer<typeof notificationQuerySchema>;
export type MarkReadDto = z.infer<typeof markReadSchema>;
