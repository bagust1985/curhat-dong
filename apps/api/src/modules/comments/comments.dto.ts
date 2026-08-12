import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().min(2).max(2000),
  parentId: z.string().uuid().optional(),
});

export const commentQuerySchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const markHelpfulSchema = z.object({ helpful: z.boolean().default(true) });

export const reactionSchema = z.object({
  type: z.enum([
    'aku_ngerti',
    'peluk_virtual',
    'aku_dengerin',
    'aku_pernah_di_situ',
    'tetap_kuat',
    'cerita_lagi',
  ]),
});

export const feltHeardAnswerSchema = z.object({
  promptId: z.string().uuid(),
  answer: z.enum(['yes', 'somewhat', 'no']),
});

export const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'message', 'user']),
  targetId: z.string().uuid(),
  category: z.enum([
    'bullying',
    'harassment',
    'sexual',
    'hate',
    'threat',
    'scam',
    'doxxing',
    'spam',
    'dangerous_content',
    'other',
  ]),
  note: z.string().max(1000).optional(),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type CommentQueryDto = z.infer<typeof commentQuerySchema>;
export type MarkHelpfulDto = z.infer<typeof markHelpfulSchema>;
export type ReactionDto = z.infer<typeof reactionSchema>;
export type FeltHeardAnswerDto = z.infer<typeof feltHeardAnswerSchema>;
export type ReportDto = z.infer<typeof reportSchema>;
