import { z } from 'zod';

export const roomMessageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const closeRoomSchema = z.object({
  /** Only the honest reasons a person can give; the rest are system-set. */
  reason: z.enum(['requester_ended', 'listener_ended']).optional(),
});

export const feedbackSchema = z
  .object({
    /** Requester: "Kamu merasa didengar?" */
    feltHeard: z.enum(['yes', 'somewhat', 'no']).optional(),
    /** Listener: "Percakapan berjalan aman?" */
    feltSafe: z.boolean().optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .refine((value) => value.feltHeard !== undefined || value.feltSafe !== undefined, {
    message: 'Pilih salah satu jawabannya ya.',
  });

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Tulis dulu ya.').max(4_000),
  clientMessageId: z.string().min(1).max(64).optional(),
});

export type RoomMessageQueryDto = z.infer<typeof roomMessageQuerySchema>;
export type CloseRoomDto = z.infer<typeof closeRoomSchema>;
export type FeedbackDto = z.infer<typeof feedbackSchema>;
export type SendMessageDto = z.infer<typeof sendMessageSchema>;
