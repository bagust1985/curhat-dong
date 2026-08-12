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
