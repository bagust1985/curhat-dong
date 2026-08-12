/**
 * The closed notification catalogue — E12-T04. PRD §14, TECH-SPEC §6.2.
 *
 * CLAUDE.md non-negotiable #3: curhat, chat and AI conversation content never
 * reaches a notification. The way that rule is kept here is structural rather
 * than procedural — there is no template with a slot to put text into, so
 * there is nothing for a caller to fill with a post body.
 *
 * A notification therefore says only *that* something happened and *where* to
 * look. Anyone wanting to know what was said has to open the app, which is the
 * only place a lock screen cannot leak it from.
 *
 * Adding a template is a deliberate act: add a key here, and the whole system
 * — push, in-app, realtime — can send it. There is no other way in.
 */

export type NotificationCategory =
  | 'social'
  | 'response'
  | 'listener'
  | 'ai'
  | 'safety'
  | 'account';

/**
 * What a notification points at. The id travels separately from the template,
 * so a deep link can be built without any copy being assembled at the call
 * site.
 */
export type NotificationTargetType =
  | 'post'
  | 'room'
  | 'match'
  | 'conversation'
  | 'listen_hub'
  | 'moderation_action'
  | 'support';

export interface NotificationTemplate {
  readonly category: NotificationCategory;
  /** Generic by design — the same on the lock screen as in the app. */
  readonly title: string;
  readonly body: string;
  readonly targetType: NotificationTargetType;
  /**
   * True when the notification stops being useful if it is held until quiet
   * hours end. Perishable notifications are dropped instead of queued, so
   * nobody wakes up to a pile of invitations that expired overnight.
   */
  readonly perishable: boolean;
}

/**
 * Every notification the product can send.
 *
 * The three strings TECH-SPEC §6.2 lists as allowed appear verbatim below;
 * the rest follow the same shape — a fact about an event, never its content.
 */
export const NOTIFICATION_TEMPLATES = {
  'response.comment': {
    category: 'response',
    title: 'Curhat Dong',
    body: 'Ada seseorang yang membalas curhatmu.',
    targetType: 'post',
    perishable: false,
  },
  'response.reply': {
    category: 'response',
    title: 'Curhat Dong',
    body: 'Ada seseorang yang membalas komentarmu.',
    targetType: 'post',
    perishable: false,
  },
  'social.reaction': {
    category: 'social',
    title: 'Curhat Dong',
    body: 'Ada yang lagi dengerin ceritamu.',
    targetType: 'post',
    perishable: false,
  },
  'social.helpful': {
    category: 'social',
    title: 'Curhat Dong',
    body: 'Balasanmu ditandai membantu buat seseorang.',
    targetType: 'post',
    perishable: false,
  },
  'social.felt_heard_prompt': {
    category: 'social',
    title: 'Curhat Dong',
    body: 'Ceritamu sudah dapat balasan.',
    targetType: 'post',
    perishable: false,
  },
  'listener.nudge': {
    category: 'listener',
    title: 'Curhat Dong',
    body: 'Ada seseorang yang sedang butuh didengar.',
    targetType: 'listen_hub',
    // A nudge is about right now. Delivered at 07:00 it points at a feed that
    // has moved on, and it costs the listener a notification for nothing.
    perishable: true,
  },
  'listener.match_offer': {
    category: 'listener',
    title: 'Curhat Dong',
    body: 'Ada yang butuh didengar sekarang.',
    targetType: 'match',
    // The offer itself expires in 60 seconds (TECH-SPEC §4.5).
    perishable: true,
  },
  'listener.matched': {
    category: 'listener',
    title: 'Curhat Dong',
    body: 'Listener tersedia untukmu.',
    targetType: 'room',
    perishable: false,
  },
  'listener.room_message': {
    category: 'listener',
    title: 'Curhat Dong',
    body: 'Ada pesan baru di ruang privatmu.',
    targetType: 'room',
    perishable: false,
  },
  'listener.session_closed': {
    category: 'listener',
    title: 'Curhat Dong',
    body: 'Sesi ngobrolmu sudah ditutup.',
    targetType: 'room',
    perishable: false,
  },
  'ai.reminder': {
    category: 'ai',
    title: 'Curhat Dong',
    body: 'DONG AI masih di sini kalau kamu mau ngobrol.',
    targetType: 'conversation',
    perishable: false,
  },
  /**
   * Support resources, never a verdict. PRD §15.1 forbids telling a user their
   * risk level, so this says only that help is reachable.
   */
  'safety.support_available': {
    category: 'safety',
    title: 'Curhat Dong',
    body: 'Ada dukungan yang bisa kamu hubungi kapan pun.',
    targetType: 'support',
    perishable: false,
  },
  'account.moderation_action': {
    category: 'account',
    title: 'Curhat Dong',
    body: 'Ada pembaruan terkait akunmu.',
    targetType: 'moderation_action',
    perishable: false,
  },
  'account.appeal_result': {
    category: 'account',
    title: 'Curhat Dong',
    body: 'Ada kabar tentang bandingmu.',
    targetType: 'moderation_action',
    perishable: false,
  },
} as const satisfies Record<string, NotificationTemplate>;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

export const NOTIFICATION_TEMPLATE_KEYS = Object.keys(
  NOTIFICATION_TEMPLATES,
) as NotificationTemplateKey[];

export function isNotificationTemplateKey(value: unknown): value is NotificationTemplateKey {
  return typeof value === 'string' && value in NOTIFICATION_TEMPLATES;
}

export function templateFor(key: NotificationTemplateKey): NotificationTemplate {
  return NOTIFICATION_TEMPLATES[key];
}

export function categoryOf(key: NotificationTemplateKey): NotificationCategory {
  return NOTIFICATION_TEMPLATES[key].category;
}

/**
 * Routes from DESIGN-REF §2.
 *
 * A deep link carries an id, never a fragment of what the target says. Targets
 * that no longer exist are handled by the client landing on the friendly
 * empty state (E12-T07), not by the link being withheld.
 */
export function deepLinkFor(key: NotificationTemplateKey, targetId?: string | null): string {
  switch (NOTIFICATION_TEMPLATES[key].targetType) {
    case 'post':
      return targetId ? `/post/${targetId}` : '/notifications';
    case 'room':
      return targetId ? `/room/${targetId}` : '/listen';
    case 'match':
      return '/listen';
    case 'conversation':
      return targetId ? `/ai?conversation=${targetId}` : '/ai';
    case 'listen_hub':
      return '/listen';
    case 'moderation_action':
      return targetId ? `/moderation/appeal/${targetId}` : '/moderation/actions';
    case 'support':
      return '/settings';
  }
}
