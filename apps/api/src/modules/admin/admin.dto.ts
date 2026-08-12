import { z } from 'zod';

/** A TOTP code, as typed. Whitespace is tolerated — people paste. */
const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Kode MFA harus 6 angka');

export const mfaCodeSchema = z.object({ code: totpCode });

export const auditQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().max(120).optional(),
  targetType: z.string().max(60).optional(),
  targetId: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const privateContentSchema = z.object({
  caseId: z.string().uuid(),
  targetType: z.enum(['post', 'comment', 'message', 'user']),
  targetId: z.string().uuid(),
});

export type MfaCodeDto = z.infer<typeof mfaCodeSchema>;
export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
export type PrivateContentDto = z.infer<typeof privateContentSchema>;

// --- Moderation queue & cases (E14-T05, T06) --------------------------------

export const queueQuerySchema = z.object({
  queue: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum(['open', 'in_review', 'resolved', 'escalated']).optional(),
  breachedOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
  assignedTo: z.string().uuid().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * The seven actions of PRD §15, and nothing else.
 *
 * Notably absent: any field for a safety level. There is no way to express
 * "punish this because it was L3" (non-negotiable #2), because the request
 * shape cannot carry it.
 */
export const applyActionSchema = z.object({
  action: z.enum(['approve', 'remove', 'warn', 'mute', 'suspend', 'ban', 'escalate']),
  /** Read by an appeal reviewer, so it has to say something. */
  reason: z.string().trim().min(10).max(2000),
  durationHours: z.coerce.number().int().min(1).max(8760).optional(),
});

export const bulkActionSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1).max(100),
  /** Bulk is limited to the two outcomes that are reversible or harmless. */
  action: z.enum(['approve', 'remove']),
  reason: z.string().trim().min(10).max(2000),
});

// --- Appeals (E14-T07) ------------------------------------------------------

export const appealDecisionSchema = z
  .object({
    status: z.enum(['upheld', 'overturned', 'reduced']),
    /** Sent to the user, so it is written for them, not for the log. */
    note: z.string().trim().min(10).max(2000),
    reducedDurationHours: z.coerce.number().int().min(1).max(8760).optional(),
  })
  .refine((value) => value.status !== 'reduced' || value.reducedDurationHours !== undefined, {
    message: 'Keputusan "dikurangi" wajib menyebut durasi barunya',
    path: ['reducedDurationHours'],
  });

export type QueueQueryDto = z.infer<typeof queueQuerySchema>;
export type ApplyActionDto = z.infer<typeof applyActionSchema>;
export type BulkActionDto = z.infer<typeof bulkActionSchema>;
export type AppealDecisionDto = z.infer<typeof appealDecisionSchema>;

// --- User management (E14-T08) ----------------------------------------------

export const userSearchSchema = z.object({
  /**
   * Alias, internal id, an email, or an email hash.
   *
   * An email is hashed before it reaches the database — plaintext email is not
   * stored (TECH-SPEC §7.5), so "search by email" works without the platform
   * ever being able to search *for* one.
   */
  query: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'muted', 'suspended', 'banned', 'deleted']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const userActionSchema = z.object({
  action: z.enum(['warn', 'mute', 'suspend', 'ban', 'unban']),
  reason: z.string().trim().min(10).max(2000),
  durationHours: z.coerce.number().int().min(1).max(8760).optional(),
});

// --- Content management (E14-T09) -------------------------------------------

export const contentQuerySchema = z.object({
  status: z.enum(['pending_analysis', 'published', 'held', 'removed', 'deleted']).optional(),
  safetyLevel: z.enum(['pending', 'L0', 'L1', 'L2', 'L3']).optional(),
  categorySlug: z.string().trim().max(60).optional(),
  reportedOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const contentReasonSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

export const commentLockSchema = z.object({
  allowComments: z.boolean(),
  reason: z.string().trim().min(10).max(2000),
});

// --- Listener management (E14-T10) ------------------------------------------

export const listenerQuerySchema = z.object({
  safetyStatus: z.enum(['ok', 'under_review', 'suspended']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const listenerActionSchema = z.object({
  action: z.enum(['suspend', 'restore', 'under_review']),
  reason: z.string().trim().min(10).max(2000),
});

// --- Category management (E14-T11) ------------------------------------------

export const categoryCreateSchema = z.object({
  slug: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(60),
  icon: z.string().trim().max(60).optional(),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
});

/**
 * No `slug` field, deliberately.
 *
 * Slugs appear in URLs and in the feed's topic filter; changing one silently
 * breaks every link anyone shared. Leaving it out of the request shape is a
 * stronger guarantee than validating it away.
 */
export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  displayOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const categoryReorderSchema = z.object({
  order: z
    .array(z.object({ id: z.string().uuid(), displayOrder: z.number().int().min(0).max(999) }))
    .min(1)
    .max(100),
});

export const categoryArchiveSchema = z.object({ isActive: z.boolean() });

export type UserSearchDto = z.infer<typeof userSearchSchema>;
export type UserActionDto = z.infer<typeof userActionSchema>;
export type ContentQueryDto = z.infer<typeof contentQuerySchema>;
export type ContentReasonDto = z.infer<typeof contentReasonSchema>;
export type CommentLockDto = z.infer<typeof commentLockSchema>;
export type ListenerQueryDto = z.infer<typeof listenerQuerySchema>;
export type ListenerActionDto = z.infer<typeof listenerActionSchema>;
export type CategoryCreateDto = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateDto = z.infer<typeof categoryUpdateSchema>;
export type CategoryReorderDto = z.infer<typeof categoryReorderSchema>;
export type CategoryArchiveDto = z.infer<typeof categoryArchiveSchema>;

// --- AI config (E14-T12) ----------------------------------------------------

/**
 * A threshold map.
 *
 * Bounds are re-checked in the service against the same constants the safety
 * engine uses, because that is where the "no off switch" rule lives
 * (non-negotiable #1). The bounds here are the first, friendlier refusal.
 */
const thresholdMap = z.record(z.string().min(2).max(40), z.number().min(0.05).max(0.95));

export const thresholdUpdateSchema = z.object({
  thresholds: z.object({ l1: thresholdMap, l2: thresholdMap, l3: thresholdMap }),
  reason: z.string().trim().min(10).max(2000),
});

export const configReasonSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

export const routingUpdateSchema = z.object({
  routing: z.record(z.string().min(1).max(60), z.unknown()),
  reason: z.string().trim().min(10).max(2000),
});

export const promptPublishSchema = z.object({
  template: z.string().trim().min(20).max(20000),
  changeNote: z.string().trim().min(10).max(2000),
});

export const promptRollbackSchema = z.object({
  version: z.coerce.number().int().min(1),
  reason: z.string().trim().min(10).max(2000),
});

export const promptDiffSchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

export type ThresholdUpdateDto = z.infer<typeof thresholdUpdateSchema>;
export type ConfigReasonDto = z.infer<typeof configReasonSchema>;
export type RoutingUpdateDto = z.infer<typeof routingUpdateSchema>;
export type PromptPublishDto = z.infer<typeof promptPublishSchema>;
export type PromptRollbackDto = z.infer<typeof promptRollbackSchema>;
export type PromptDiffDto = z.infer<typeof promptDiffSchema>;
