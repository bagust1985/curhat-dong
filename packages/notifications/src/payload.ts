/**
 * Notification payload builder — E12-T04. CLAUDE.md non-negotiable #3.
 *
 * Two layers guard the same rule, because one of them is not enough.
 *
 * The type layer: `NotificationRequest` has no field that accepts prose, and
 * `NoFreeText` turns any extra property into `never`. A caller who reaches for
 * `body`, `title`, `text`, `preview` — or passes a wider object that happens
 * to carry one — does not compile. TypeScript's excess-property check alone
 * would only catch object literals, and the interesting mistake is the other
 * one: passing along a variable that already holds the post.
 *
 * The runtime layer: `buildNotificationPayload` constructs the payload from
 * the template catalogue and copies nothing from its input except ids. It is
 * not sanitising a caller's text; there is no caller text to sanitise. That
 * matters at the job boundary, where a payload arrives as JSON from Redis and
 * has no types at all.
 */

import {
  NOTIFICATION_TEMPLATES,
  deepLinkFor,
  isNotificationTemplateKey,
  type NotificationCategory,
  type NotificationTemplateKey,
} from './templates.js';

export interface NotificationRequest {
  readonly template: NotificationTemplateKey;
  /** Id of the thing to open. Never content, never an alias, never a name. */
  readonly targetId?: string | null;
  /**
   * Idempotency key (E12-T06). Built from event identity — "comment X on post
   * Y" — so a retried job recognises its own work instead of notifying twice.
   */
  readonly dedupeKey?: string | null;
}

/**
 * Rejects any property that is not part of the allowed request shape.
 *
 * `Allowed` widens the permitted keys for callers that legitimately carry more
 * routing information — the API's fan-out adds `userId` and `actorId` — without
 * ever opening a slot for text.
 *
 * The mapped type makes every surplus key `never`, so no value can satisfy it.
 * This is what turns "please don't put the curhat in the notification" from a
 * code review comment into a compile error.
 */
export type NoFreeText<T, Allowed = NotificationRequest> = T & {
  readonly [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** What is persisted in `notifications.payload` and handed to a push provider. */
export interface NotificationPayload {
  readonly template: NotificationTemplateKey;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly body: string;
  readonly targetId: string | null;
  readonly deepLink: string;
}

/**
 * Builds the payload for a template.
 *
 * Everything user-visible comes from the catalogue. The only thing taken from
 * the caller is an id, and an id is not readable on a lock screen.
 */
export function buildNotificationPayload<T extends NotificationRequest>(
  request: NoFreeText<T>,
): NotificationPayload {
  const template = NOTIFICATION_TEMPLATES[request.template];

  return {
    template: request.template,
    category: template.category,
    title: template.title,
    body: template.body,
    targetId: request.targetId ?? null,
    deepLink: deepLinkFor(request.template, request.targetId),
  };
}

export class UnknownNotificationTemplateError extends Error {
  constructor(readonly received: unknown) {
    super('Unknown notification template');
    this.name = 'UnknownNotificationTemplateError';
  }
}

/**
 * Rebuilds a payload that crossed a boundary without types — a queued job, a
 * row read back from the database.
 *
 * Deliberately a rebuild rather than a validation: whatever the stored object
 * claims its title and body are is discarded and taken from the catalogue
 * again. A row written by an older, looser version of this code cannot
 * resurrect text that is no longer allowed.
 */
export function rebuildNotificationPayload(stored: unknown): NotificationPayload {
  const record = (stored ?? {}) as Record<string, unknown>;
  const template = record['template'];

  if (!isNotificationTemplateKey(template)) {
    throw new UnknownNotificationTemplateError(template);
  }

  const targetId = record['targetId'];

  return buildNotificationPayload({
    template,
    targetId: typeof targetId === 'string' ? targetId : null,
  });
}

/**
 * True when a value carries anything that could be user-written text.
 *
 * Used by the tests that stand in for the type system at runtime, and by the
 * job consumer, which receives JSON and therefore has no compiler to trust.
 */
const FREE_TEXT_KEYS = [
  'body',
  'title',
  'text',
  'message',
  'content',
  'preview',
  'snippet',
  'excerpt',
  'alias',
  'name',
];

export function containsFreeText(input: unknown): boolean {
  if (input === null || typeof input !== 'object') return false;
  return Object.keys(input as Record<string, unknown>).some((key) => FREE_TEXT_KEYS.includes(key));
}
