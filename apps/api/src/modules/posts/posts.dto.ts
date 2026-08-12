import { z } from 'zod';

const MOODS = [
  'sedih',
  'marah',
  'cemas',
  'capek',
  'patah_hati',
  'kosong',
  'overthinking',
  'lega',
  'senang',
  'bersyukur',
  'bingung',
] as const;

const INTENTS = ['cuma_didengar', 'butuh_saran', 'butuh_dukungan', 'pernah_ngalamin'] as const;

export const createPostSchema = z.object({
  title: z.string().max(160).optional(),
  /**
   * 20 characters minimum.
   *
   * Not an arbitrary floor: a two-word post gives a listener nothing to
   * respond to, and the feed fills with fragments nobody can help with.
   */
  body: z.string().min(20).max(5000),
  categorySlug: z.string().min(1).max(48),
  mood: z.enum(MOODS),
  intent: z.enum(INTENTS),
  anonymityMode: z.enum(['alias', 'anonymous']).default('alias'),
  allowComments: z.boolean().default(true),
  requestListener: z.boolean().default(false),
  /**
   * Set once the user has seen and accepted the anti-doxxing warning
   * (PRD §15). The warning informs; it never blocks.
   */
  acknowledgedPersonalDataWarning: z.boolean().default(false),
});

export const feedQuerySchema = z.object({
  tab: z.enum(['untuk-kamu', 'terbaru', 'butuh-didengar', 'topik']).default('terbaru'),
  category: z.string().max(48).optional(),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const updatePostSchema = z
  .object({ allowComments: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, { message: 'Tidak ada yang diubah' });

export type CreatePostDto = z.infer<typeof createPostSchema>;
export type FeedQueryDto = z.infer<typeof feedQuerySchema>;
export type UpdatePostDto = z.infer<typeof updatePostSchema>;
