/**
 * Seeded values for `app_configs` — the proposals recapped in PRD §25.7.
 *
 * Every number here is tunable from the admin panel without a deploy. They are
 * defaults, not constants: PRD §25.7 lists them as usulan awaiting sign-off.
 */

export const APP_CONFIG_DEFAULTS = {
  /** TECH-SPEC §4.7 */
  'rate_limit.post_per_day': 10,
  'rate_limit.comment_per_hour': 60,
  'rate_limit.report_per_day': 20,
  'rate_limit.otp_per_hour_per_email': 5,

  /** PRD §10 — AI cost guard */
  'ai.messages_per_day': 50,
  'ai.messages_per_day_degraded': 25,
  'ai.budget_alert_warn_pct': 70,
  'ai.budget_alert_critical_pct': 90,

  /** PRD §9 — Felt Heard anti-fatigue */
  'felt_heard.max_per_target': 1,
  'felt_heard.max_per_day': 3,
  'felt_heard.delay_minutes': 30,

  /** PRD §11.2 — listener burnout protection */
  'listener.max_concurrent': 3,
  'listener.max_sessions_per_day': 8,
  'listener.cooldown_minutes': 10,
  'listener.rest_reminder_after_sessions': 3,
  'listener.rest_reminder_after_minutes': 90,

  /** TECH-SPEC §4.5 — matching */
  'matching.offer_ttl_seconds': 60,
  'matching.max_candidates': 5,

  /** PRD §14 — quiet hours (local device time) */
  'notification.quiet_hours_start': 22,
  'notification.quiet_hours_end': 7,

  /**
   * PRD §15.3 — moderation SLA in minutes.
   *
   * The night window is only slightly wider, not waived: peak usage on this
   * product is at night, so the quietest moderator hours are the busiest crisis
   * hours. Meeting this needs an on-call rota, not just a config value.
   */
  'moderation.sla_minutes.critical_day': 15,
  'moderation.sla_minutes.critical_night': 30,
  'moderation.sla_minutes.high_day': 120,
  'moderation.sla_minutes.high_night': 240,
  'moderation.sla_minutes.medium': 720,
  'moderation.sla_minutes.low': 2880,
  'moderation.night_window_start': 21,
  'moderation.night_window_end': 4,

  /** PRD §15.4 — appeals */
  'appeal.window_days': 14,
  'appeal.sla_days': 7,

  /** PRD §15.2 — support resources must be re-verified quarterly */
  'support_resources.reverify_days': 90,

  /** PRD §25.4 — retention, in days */
  'retention.days.post_grace_after_delete': 30,
  'retention.days.room_messages': 365,
  'retention.days.ai_messages': 180,
  'retention.days.safety': 730,
  'retention.days.moderation': 730,
  'retention.days.otp_hours': 24,
  'retention.days.revoked_sessions': 90,
  'retention.days.inactive_devices': 180,

  /** TECH-SPEC §4.7 — "Butuh Didengar" feed rules */
  'feed.butuh_didengar.max_responses': 2,
  'feed.butuh_didengar.max_age_hours': 48,

  /** DESIGN-REF §0 — Midnight Mode window */
  'ui.midnight_mode_start': 21,
  'ui.midnight_mode_end': 4,
} as const satisfies Record<string, number>;

export type AppConfigKey = keyof typeof APP_CONFIG_DEFAULTS;

export const FEATURE_FLAG_DEFAULTS = {
  /** PRD §12 — Phase 2 */
  'journal.enabled': false,
  'ai.personality.journal_companion': false,
  /** PRD §6 — Phase 2 */
  'feed.following_tab': false,
  /** PRD §16 — Phase 2 */
  'communities.enabled': false,
  /** Kept switchable so a bad rollout can be stopped without a deploy. */
  'listener.matching_enabled': true,
  'ai.chat_enabled': true,
} as const satisfies Record<string, boolean>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS;

/** PRD §16 — 15 starting categories, managed by admin thereafter. */
export const SEED_CATEGORIES: ReadonlyArray<{ slug: string; name: string; icon: string }> = [
  { slug: 'relationship', name: 'Hubungan', icon: 'heart' },
  { slug: 'marriage', name: 'Pernikahan', icon: 'rings' },
  { slug: 'family', name: 'Keluarga', icon: 'home' },
  { slug: 'work', name: 'Kerjaan', icon: 'briefcase' },
  { slug: 'career', name: 'Karier', icon: 'trending-up' },
  { slug: 'finance', name: 'Keuangan', icon: 'wallet' },
  { slug: 'friendship', name: 'Pertemanan', icon: 'users' },
  { slug: 'loneliness', name: 'Kesepian', icon: 'moon' },
  { slug: 'self-confidence', name: 'Percaya Diri', icon: 'sparkle' },
  { slug: 'college', name: 'Kuliah', icon: 'graduation-cap' },
  { slug: 'parenting', name: 'Jadi Orang Tua', icon: 'baby' },
  { slug: 'business', name: 'Usaha', icon: 'store' },
  { slug: 'loss', name: 'Kehilangan', icon: 'candle' },
  { slug: 'random', name: 'Random', icon: 'shuffle' },
  { slug: 'positive-story', name: 'Cerita Baik', icon: 'sun' },
];
