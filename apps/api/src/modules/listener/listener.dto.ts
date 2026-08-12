import { z } from 'zod';

/** MVP is Indonesian only (PRD §11); the field exists so expansion needs no migration. */
const language = z.enum(['id']);

const topics = z.array(z.string().trim().min(1).max(40)).max(15);

export const activateSchema = z.object({
  guidelinesVersion: z.string().min(1),
  topics: topics.optional(),
  languages: z.array(language).min(1).optional(),
});

export const updateProfileSchema = z
  .object({
    topics: topics.optional(),
    languages: z.array(language).min(1).optional(),
    maxConcurrent: z.coerce.number().int().min(1).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nggak ada yang diubah.',
  });

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const createRequestSchema = z.object({
  topic: z.string().trim().min(1).max(40),
  emotion: z.string().trim().min(1).max(40),
  /** Prefilled when the request came from a post or the DONG AI bridge. */
  postId: z.string().uuid().optional(),
});

export type ActivateDto = z.infer<typeof activateSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type AvailabilityDto = z.infer<typeof availabilitySchema>;
export type CreateRequestDto = z.infer<typeof createRequestSchema>;
