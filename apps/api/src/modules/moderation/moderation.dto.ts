import { z } from 'zod';

export const submitAppealSchema = z.object({
  actionId: z.string().uuid(),
  /** 20 characters minimum: a one-word appeal gives a reviewer nothing to weigh. */
  reason: z.string().min(20).max(2000),
});

export const decideAppealSchema = z.object({
  status: z.enum(['upheld', 'overturned', 'reduced']),
  note: z.string().min(10).max(2000),
  reducedDurationHours: z.number().int().min(1).max(8760).optional(),
});

export const applyActionSchema = z.object({
  caseId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  action: z.enum(['approve', 'remove', 'warn', 'mute', 'suspend', 'ban', 'escalate']),
  /** Mandatory — an action nobody can explain cannot be reviewed on appeal. */
  reason: z.string().min(10).max(2000),
  durationHours: z.number().int().min(1).max(8760).optional(),
});

export type SubmitAppealDto = z.infer<typeof submitAppealSchema>;
export type DecideAppealDto = z.infer<typeof decideAppealSchema>;
export type ApplyActionDto = z.infer<typeof applyActionSchema>;
