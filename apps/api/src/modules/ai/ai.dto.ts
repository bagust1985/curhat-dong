import { z } from 'zod';

const personalityMode = z.enum([
  'pendengar',
  'pemikir',
  'teman_hangat',
  'teman_santai',
  'journal_companion',
]);

export const createConversationSchema = z.object({
  personalityMode: personalityMode.default('pendengar'),
});

export const setModeSchema = z.object({
  personalityMode,
});

export const conversationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const messageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const sendMessageSchema = z.object({
  // Long enough for a real story, bounded so one message cannot blow the
  // context budget on its own.
  body: z.string().trim().min(1, 'Tulis dulu ya.').max(4_000),
});

export type CreateConversationDto = z.infer<typeof createConversationSchema>;
export type SetModeDto = z.infer<typeof setModeSchema>;
export type ConversationQueryDto = z.infer<typeof conversationQuerySchema>;
export type MessageQueryDto = z.infer<typeof messageQuerySchema>;
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
