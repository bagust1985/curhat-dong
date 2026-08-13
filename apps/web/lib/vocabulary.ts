/**
 * Re-export of the shared vocabulary — E16-T04.
 *
 * The definitions moved to `@curhat/types` so the mobile app announces the same
 * mood by the same name (`packages/types/src/vocabulary.ts`). This file stays
 * because every E15 component imports from it, and a module that only forwards
 * is cheaper than touching thirty imports to prove a point.
 */
export {
  MOOD_VOCABULARY,
  REACTION_VOCABULARY,
  INTENT_VOCABULARY,
  GREETINGS,
  EMPTY_STATES,
  MOODS,
  MOOD_LABELS,
  REACTIONS,
  REACTION_LABELS,
  INTENTS,
  INTENT_LABELS,
} from '@curhat/types';

export type {
  ChipShape,
  VocabularyEntry,
  EmptyStateKey,
  Mood,
  Reaction,
  Intent,
} from '@curhat/types';
