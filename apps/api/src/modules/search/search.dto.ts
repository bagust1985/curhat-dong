import { z } from 'zod';

/**
 * Search query — E13-T02, TECH-SPEC §3.2, DESIGN-REF §2.13.
 *
 * The query is capped at 120 characters. Longer than that is not a search, it
 * is either a paste or an attempt to make the tokenizer work hard.
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  tab: z.enum(['curhat', 'listener', 'topik']).default('curhat'),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
export type SearchTab = SearchQueryDto['tab'];
