/**
 * Realtime contracts — TECH-SPEC §3.3 (SSE) and §3.5 (WebSocket).
 */

import type { SupportiveIntervention } from './api.js';
import type { ErrorCode } from './api.js';

// ---------------------------------------------------------------------------
// SSE — DONG AI streaming (TECH-SPEC §3.3)
// ---------------------------------------------------------------------------

export const SSE_EVENTS = [
  'message.start',
  'message.delta',
  'message.complete',
  'safety.intervention',
  'error',
] as const;

export type SseEventName = (typeof SSE_EVENTS)[number];

export type SseEvent =
  | { event: 'message.start'; data: { messageId: string } }
  | { event: 'message.delta'; data: { delta: string } }
  | { event: 'message.complete'; data: { messageId: string; finishReason: string } }
  /**
   * Emitted alongside — never instead of — the assistant reply. DONG AI must
   * keep talking when it detects risk (PRD §15.5); cutting the conversation is
   * the opposite of what a person in crisis needs.
   */
  | { event: 'safety.intervention'; data: SupportiveIntervention }
  | { event: 'error'; data: { code: ErrorCode; message: string } };

// ---------------------------------------------------------------------------
// WebSocket /rt (TECH-SPEC §3.5)
// ---------------------------------------------------------------------------

export const WS_CLIENT_EVENTS = ['room:join', 'room:message', 'room:typing', 'room:leave'] as const;

export type WsClientEvent = (typeof WS_CLIENT_EVENTS)[number];

export const WS_SERVER_EVENTS = [
  'room:message',
  'room:typing',
  'room:presence',
  'room:closed',
  'room:safety',
  'match:offer',
  'match:accepted',
  'notification:new',
] as const;

export type WsServerEvent = (typeof WS_SERVER_EVENTS)[number];

export interface RoomMessagePayload {
  roomId: string;
  messageId: string;
  /** Sender alias only — never the internal user id. */
  senderAlias: string;
  body: string;
  sentAt: string;
}

export interface RoomPresencePayload {
  roomId: string;
  alias: string;
  online: boolean;
}

/**
 * A match offer carries topic, mood and emotion — and nothing that could
 * identify the requester (PRD §11, DESIGN-REF §2.9c).
 */
export interface MatchOfferPayload {
  matchId: string;
  topic: string;
  mood: string;
  emotion: string;
  /** Server-enforced 60s TTL; the client countdown is display only. */
  expiresAt: string;
}

/**
 * Notification payloads are template ids, not free text.
 *
 * CLAUDE.md non-negotiable #3: notifications never carry curhat, chat, or AI
 * conversation content. There is deliberately no `body` field here — see
 * @curhat/types NOTIFICATION_TEMPLATES for the closed set of allowed copy.
 */
export interface NotificationPayload {
  notificationId: string;
  template: NotificationTemplate;
  /** Deep-link target. An id, never content. */
  targetType: 'post' | 'comment' | 'room' | 'match' | 'account';
  targetId: string;
}

export const NOTIFICATION_TEMPLATES = {
  post_replied: 'Ada seseorang yang membalas curhatmu.',
  someone_needs_listener: 'Ada seseorang yang sedang butuh didengar.',
  listener_available: 'Listener tersedia untukmu.',
  listener_match_offer: 'Ada yang butuh didengar. Kamu siap?',
  moderation_action: 'Ada pembaruan terkait akunmu.',
  appeal_decided: 'Bandingmu sudah ditinjau.',
} as const satisfies Record<string, string>;

export type NotificationTemplate = keyof typeof NOTIFICATION_TEMPLATES;
