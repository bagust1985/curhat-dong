/**
 * Domain vocabulary — the single source of truth (E01-T04).
 *
 * Web, admin, mobile and api all import from here. Re-declaring any of these
 * lists elsewhere means the UI and the database can drift apart, and in this
 * product that drift lands on safety-critical paths.
 */

// ---------------------------------------------------------------------------
// Mood — PRD §7 (11 values)
// ---------------------------------------------------------------------------

export const MOODS = [
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

export type Mood = (typeof MOODS)[number];

/** Indonesian UI copy. CLAUDE.md: code English, UI strings Indonesian. */
export const MOOD_LABELS: Readonly<Record<Mood, string>> = {
  sedih: 'Sedih',
  marah: 'Marah',
  cemas: 'Cemas',
  capek: 'Capek',
  patah_hati: 'Patah hati',
  kosong: 'Kosong',
  overthinking: 'Overthinking',
  lega: 'Lega',
  senang: 'Senang',
  bersyukur: 'Bersyukur',
  bingung: 'Bingung',
};

// ---------------------------------------------------------------------------
// Intent — PRD §7 (4 values). Feeds the matching engine.
// ---------------------------------------------------------------------------

export const INTENTS = ['cuma_didengar', 'butuh_saran', 'butuh_dukungan', 'pernah_ngalamin'] as const;

export type Intent = (typeof INTENTS)[number];

export const INTENT_LABELS: Readonly<Record<Intent, string>> = {
  cuma_didengar: 'Aku cuma mau didengar',
  butuh_saran: 'Aku butuh saran',
  butuh_dukungan: 'Aku butuh dukungan',
  pernah_ngalamin: 'Ada yang pernah ngalamin?',
};

// ---------------------------------------------------------------------------
// Reactions — PRD §9 (6 values).
//
// These are empathy words, NOT likes. There is deliberately no single dominant
// "approve" reaction, and no reaction carries more weight than another.
// ---------------------------------------------------------------------------

export const REACTIONS = [
  'aku_ngerti',
  'peluk_virtual',
  'aku_dengerin',
  'aku_pernah_di_situ',
  'tetap_kuat',
  'cerita_lagi',
] as const;

export type Reaction = (typeof REACTIONS)[number];

export const REACTION_LABELS: Readonly<Record<Reaction, string>> = {
  aku_ngerti: 'Aku ngerti',
  peluk_virtual: 'Peluk virtual',
  aku_dengerin: 'Aku dengerin',
  aku_pernah_di_situ: 'Aku pernah di situ',
  tetap_kuat: 'Tetap kuat',
  cerita_lagi: 'Cerita lagi',
};

// ---------------------------------------------------------------------------
// Safety — PRD §8, TECH-SPEC §2.3
// ---------------------------------------------------------------------------

/**
 * L0 normal · L1 sensitive · L2 potential harm · L3 immediate risk.
 *
 * `pending` is the transient state used when AI analysis timed out while the
 * local rule engine flagged high risk (TECH-SPEC §4.2). It is not a level —
 * it means "we do not know yet, so hold".
 */
export const SAFETY_LEVELS = ['L0', 'L1', 'L2', 'L3', 'pending'] as const;

export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export const MODERATION_QUEUES = ['critical', 'high', 'medium', 'low'] as const;

export type ModerationQueue = (typeof MODERATION_QUEUES)[number];

/**
 * PRD §15. `approve` and `escalate` are not punitive and therefore not
 * appealable; the rest are (PRD §15.4).
 */
export const MODERATION_ACTIONS = [
  'approve',
  'remove',
  'warn',
  'mute',
  'suspend',
  'ban',
  'escalate',
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const APPEALABLE_ACTIONS = ['remove', 'warn', 'mute', 'suspend', 'ban'] as const;

export type AppealableAction = (typeof APPEALABLE_ACTIONS)[number];

export function isAppealable(action: ModerationAction): action is AppealableAction {
  return (APPEALABLE_ACTIONS as readonly string[]).includes(action);
}

export const APPEAL_STATUSES = [
  'pending',
  'under_review',
  'upheld',
  'overturned',
  'reduced',
] as const;

export type AppealStatus = (typeof APPEAL_STATUSES)[number];

// ---------------------------------------------------------------------------
// Reports — PRD §15 (10 categories)
// ---------------------------------------------------------------------------

export const REPORT_CATEGORIES = [
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
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Readonly<Record<ReportCategory, string>> = {
  bullying: 'Bullying',
  harassment: 'Pelecehan',
  sexual: 'Konten seksual',
  hate: 'Ujaran kebencian',
  threat: 'Ancaman',
  scam: 'Penipuan',
  doxxing: 'Penyebaran data pribadi',
  spam: 'Spam',
  dangerous_content: 'Konten berbahaya',
  other: 'Lainnya',
};

/**
 * Urgent categories jump the queue (PRD §15: "Urgent report = priority").
 */
export const URGENT_REPORT_CATEGORIES: readonly ReportCategory[] = [
  'threat',
  'dangerous_content',
  'sexual',
];

// ---------------------------------------------------------------------------
// Content lifecycle — TECH-SPEC §2.3
// ---------------------------------------------------------------------------

export const POST_STATUSES = [
  'draft',
  'pending_analysis',
  'published',
  'held',
  'removed',
  'deleted',
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const ANONYMITY_MODES = ['alias', 'anonymous'] as const;

export type AnonymityMode = (typeof ANONYMITY_MODES)[number];

// ---------------------------------------------------------------------------
// Felt Heard — PRD §9, §19.1. North Star input.
// ---------------------------------------------------------------------------

export const FELT_HEARD_ANSWERS = ['yes', 'somewhat', 'no'] as const;

export type FeltHeardAnswer = (typeof FELT_HEARD_ANSWERS)[number];

export const FELT_HEARD_ANSWER_LABELS: Readonly<Record<FeltHeardAnswer, string>> = {
  yes: 'Iya, merasa didengar',
  somewhat: 'Sedikit',
  no: 'Belum',
};

/**
 * Felt Heard Rate = (yes + somewhat) / answered.
 *
 * Dismissed prompts are excluded from the denominator (PRD §9). Counting a
 * dismissal as "no" would make the metric measure annoyance rather than
 * whether anyone felt heard.
 */
export function feltHeardRate(counts: Readonly<Record<FeltHeardAnswer, number>>): number | null {
  const answered = counts.yes + counts.somewhat + counts.no;
  if (answered === 0) return null;
  return (counts.yes + counts.somewhat) / answered;
}

// ---------------------------------------------------------------------------
// DONG AI — PRD §10 (5 personality modes)
// ---------------------------------------------------------------------------

export const AI_PERSONALITIES = [
  'pendengar',
  'pemikir',
  'teman_hangat',
  'teman_santai',
  'journal_companion',
] as const;

export type AiPersonality = (typeof AI_PERSONALITIES)[number];

export const AI_PERSONALITY_LABELS: Readonly<Record<AiPersonality, string>> = {
  pendengar: 'Pendengar',
  pemikir: 'Pemikir',
  teman_hangat: 'Teman Hangat',
  teman_santai: 'Teman Santai',
  journal_companion: 'Journal Companion',
};

/** Journal Companion ships in Phase 2 — gated behind a feature flag. */
export const PHASE_2_PERSONALITIES: readonly AiPersonality[] = ['journal_companion'];

// ---------------------------------------------------------------------------
// Feed & notifications
// ---------------------------------------------------------------------------

export const FEED_TABS = ['untuk-kamu', 'terbaru', 'butuh-didengar', 'topik'] as const;

export type FeedTab = (typeof FEED_TABS)[number];

export const NOTIFICATION_TYPES = [
  'social',
  'response',
  'listener',
  'ai',
  'safety',
  'account',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Quiet hours do not apply to these (PRD §14). Everything else waits until
 * morning — a listener nudge at 02:00 is the fastest way to lose a user.
 */
export const QUIET_HOURS_EXEMPT_TYPES: readonly NotificationType[] = ['safety', 'account'];

export const PUSH_PROVIDERS = ['expo', 'fcm', 'webpush'] as const;

export type PushProvider = (typeof PUSH_PROVIDERS)[number];

// ---------------------------------------------------------------------------
// Consent — PRD §25.3
// ---------------------------------------------------------------------------

export const CONSENT_TYPES = ['tos_privacy', 'sensitive_processing', 'analytics'] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

/**
 * Analytics consent is optional and must never gate a core feature.
 * Bundling all three into one checkbox invalidates the consent (PRD §25.3).
 */
export const REQUIRED_CONSENT_TYPES: readonly ConsentType[] = [
  'tos_privacy',
  'sensitive_processing',
];

// ---------------------------------------------------------------------------
// Admin RBAC — PRD §2
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = [
  'super_admin',
  'moderator',
  'customer_support',
  'content_manager',
  'finance',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
