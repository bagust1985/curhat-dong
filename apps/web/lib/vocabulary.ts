import {
  INTENTS,
  INTENT_LABELS,
  MOODS,
  MOOD_LABELS,
  REACTIONS,
  REACTION_LABELS,
  type Intent,
  type Mood,
  type Reaction,
} from '@curhat/types';

/**
 * The visual and accessible layer over the domain vocabulary — E15-T02.
 * PRD §23.1, DESIGN-REF §5.
 *
 * The words themselves live in `@curhat/types` so API and UI cannot drift. What
 * is added here is everything an icon needs in order not to be a barrier:
 *
 *  - a **glyph**, so the chip is recognisable at a glance;
 *  - an **accessible name**, because 11 moods, 6 reactions and 4 intents are the
 *    core interaction of this product. Unlabelled, the whole thing is unusable
 *    with a screen reader (PRD §23.1);
 *  - a **shape**, because meaning must never be carried by colour alone. Two
 *    moods that differ only in hue are two moods a colour-blind reader cannot
 *    tell apart.
 *
 * The accessible name is deliberately *longer* than the visible label in places.
 * "Peluk virtual" reads fine beside a hugging glyph; announced on its own it is
 * ambiguous, so the spoken form says what the action means.
 */

/** A non-colour differentiator, so hue is never the only signal. */
export type ChipShape = 'round' | 'square' | 'notch' | 'pill';

export interface VocabularyEntry {
  glyph: string;
  /** What a screen reader announces. Never just the glyph. */
  a11yLabel: string;
  shape: ChipShape;
}

/**
 * The 11 moods — PRD §7.
 *
 * Shapes are assigned by emotional family rather than arbitrarily: heavy states
 * are round, agitated ones notched, flat ones square, lighter ones pill. A
 * reader who cannot distinguish the hues still gets a grouping.
 */
export const MOOD_VOCABULARY: Readonly<Record<Mood, VocabularyEntry>> = {
  sedih: { glyph: '😔', a11yLabel: 'Mood: sedih', shape: 'round' },
  marah: { glyph: '😤', a11yLabel: 'Mood: marah', shape: 'notch' },
  cemas: { glyph: '😰', a11yLabel: 'Mood: cemas', shape: 'notch' },
  capek: { glyph: '😮‍💨', a11yLabel: 'Mood: capek', shape: 'round' },
  patah_hati: { glyph: '💔', a11yLabel: 'Mood: patah hati', shape: 'round' },
  kosong: { glyph: '🫥', a11yLabel: 'Mood: hampa atau kosong', shape: 'square' },
  overthinking: { glyph: '🌀', a11yLabel: 'Mood: overthinking', shape: 'notch' },
  lega: { glyph: '🌤️', a11yLabel: 'Mood: lega', shape: 'pill' },
  senang: { glyph: '🙂', a11yLabel: 'Mood: senang', shape: 'pill' },
  bersyukur: { glyph: '🤍', a11yLabel: 'Mood: bersyukur', shape: 'pill' },
  bingung: { glyph: '😕', a11yLabel: 'Mood: bingung', shape: 'square' },
};

/**
 * The 6 reactions — PRD §9.
 *
 * These are empathy *words*, not likes. The glyph is decoration beside the word,
 * never a replacement for it: a heart alone would turn "aku pernah di situ" into
 * approval, and the whole point is that no reaction outranks another.
 *
 * The accessible name says what tapping means, because "Cerita lagi" announced
 * bare sounds like a command rather than an invitation.
 */
export const REACTION_VOCABULARY: Readonly<Record<Reaction, VocabularyEntry>> = {
  aku_ngerti: { glyph: '🤝', a11yLabel: 'Beri reaksi: aku ngerti', shape: 'pill' },
  peluk_virtual: { glyph: '🫂', a11yLabel: 'Beri reaksi: peluk virtual', shape: 'round' },
  aku_dengerin: { glyph: '👂', a11yLabel: 'Beri reaksi: aku dengerin', shape: 'pill' },
  aku_pernah_di_situ: {
    glyph: '🪞',
    a11yLabel: 'Beri reaksi: aku pernah di situ juga',
    shape: 'square',
  },
  tetap_kuat: { glyph: '🌱', a11yLabel: 'Beri reaksi: tetap kuat', shape: 'notch' },
  cerita_lagi: { glyph: '💬', a11yLabel: 'Beri reaksi: cerita lagi kalau mau', shape: 'pill' },
};

/** The 4 intents — PRD §7. What the author is asking for, stated plainly. */
export const INTENT_VOCABULARY: Readonly<Record<Intent, VocabularyEntry>> = {
  cuma_didengar: { glyph: '👂', a11yLabel: 'Yang dicari: cuma mau didengar', shape: 'pill' },
  butuh_saran: { glyph: '💡', a11yLabel: 'Yang dicari: butuh saran', shape: 'square' },
  butuh_dukungan: { glyph: '🫂', a11yLabel: 'Yang dicari: butuh dukungan', shape: 'round' },
  pernah_ngalamin: {
    glyph: '🙋',
    a11yLabel: 'Yang dicari: ada yang pernah ngalamin?',
    shape: 'notch',
  },
};

export { MOODS, MOOD_LABELS, REACTIONS, REACTION_LABELS, INTENTS, INTENT_LABELS };
export type { Mood, Reaction, Intent };

/**
 * Midnight Mode copy — DESIGN-REF §0, PRD §23.
 *
 * The night wording is not a gimmick. Somebody opening this at 2am is having a
 * different kind of evening from somebody opening it at noon, and the greeting
 * should not be cheerful at them.
 */
export const GREETINGS = {
  day: 'Hai. Apa kabar hari ini?',
  midnight: 'Belum tidur? Kalau ada yang mau diceritain, gue di sini.',
} as const;

/**
 * Empty states — E15-T03.
 *
 * Warm and contextual, never "No data". An empty screen is the moment somebody
 * is most likely to close the app, and a system message earns that.
 */
export const EMPTY_STATES = {
  feed: {
    title: 'Belum ada yang cerita di sini.',
    body: 'Mau jadi yang pertama? Nggak harus panjang, nggak harus rapi.',
    action: 'Mulai curhat',
  },
  butuhDidengar: {
    title: 'Semua cerita di sini udah dapat balasan.',
    body: 'Kalau kamu mau nunggu sebentar, biasanya ada yang baru muncul.',
    action: null,
  },
  untukKamu: {
    title: 'Belum ada yang cocok buat kamu.',
    body: 'Coba pilih topik yang kamu peduliin di Settings, biar kami lebih ngerti.',
    action: 'Atur topik',
  },
  comments: {
    title: 'Belum ada yang balas.',
    body: 'Kadang butuh waktu. Cerita kamu tetap kebaca kok.',
    action: null,
  },
  notifications: {
    title: 'Belum ada notifikasi.',
    body: 'Nanti kalau ada yang membalas ceritamu, muncul di sini.',
    action: null,
  },
  search: {
    title: 'Nggak ketemu.',
    body: 'Coba kata lain, atau lihat topik yang ada di Explore.',
    action: 'Ke Explore',
  },
  rooms: {
    title: 'Belum ada ruang ngobrol.',
    body: 'Kalau kamu mau ngobrol sama orang, kami bantu cariin pendengar.',
    action: 'Cari listener',
  },
  aiConversations: {
    title: 'Belum ada obrolan.',
    body: 'DONG AI siap dengerin kapan aja. Mulai dari apa aja yang kepikiran.',
    action: 'Mulai ngobrol',
  },
} as const;

export type EmptyStateKey = keyof typeof EMPTY_STATES;
