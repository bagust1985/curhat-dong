import type { PromptKey } from '@curhat/ai';
import type { AiPersonality, FeatureFlagKey } from '@curhat/database';

/**
 * The five personality modes — E09-T02, PRD §10, DESIGN-REF §2.8b.
 *
 * Each mode maps to a versioned prompt of its own, layered *after* the
 * `chat.system` rules. Editing a persona from the admin panel changes the
 * voice; it cannot reach the boundaries, because those are in a different
 * prompt that is always applied first (see `composeSystemPrompt`).
 */
export const PERSONA_PROMPT_KEYS: Readonly<Record<AiPersonality, PromptKey>> = Object.freeze({
  pendengar: 'chat.persona.pendengar',
  pemikir: 'chat.persona.pemikir',
  teman_hangat: 'chat.persona.teman_hangat',
  teman_santai: 'chat.persona.teman_santai',
  journal_companion: 'chat.persona.journal_companion',
});

export interface PersonalityOption {
  mode: AiPersonality;
  label: string;
  description: string;
  /** Present when the mode sits behind a flag (Phase 2). */
  flag?: FeatureFlagKey;
}

/** Copy for the picker. Indonesian, warm, non-clinical (DESIGN-REF §0). */
export const PERSONALITIES: readonly PersonalityOption[] = Object.freeze([
  {
    mode: 'pendengar',
    label: 'Pendengar',
    description: 'Dengerin dulu, nggak buru-buru kasih solusi.',
  },
  {
    mode: 'pemikir',
    label: 'Pemikir',
    description: 'Bantu ngerapiin pikiran yang lagi berantakan.',
  },
  {
    mode: 'teman_hangat',
    label: 'Teman Hangat',
    description: 'Nemenin pelan-pelan waktu lagi berat.',
  },
  {
    mode: 'teman_santai',
    label: 'Teman Santai',
    description: 'Ngobrol ringan, kayak temen biasa.',
  },
  {
    mode: 'journal_companion',
    label: 'Journal Companion',
    description: 'Bantu nulis catatan harian kamu.',
    flag: 'ai.personality.journal_companion',
  },
]);

/**
 * The permanent disclaimer — E09-T07, DESIGN-REF §2.8c.
 *
 * Served from the API so web and mobile show exactly the same sentence, and
 * so it cannot be dropped by one client without the other noticing. It is a
 * reminder, not a warning label: the tone matters as much as the fact.
 */
export const AI_DISCLAIMER = 'DONG AI teman ngobrol, bukan psikolog.';
