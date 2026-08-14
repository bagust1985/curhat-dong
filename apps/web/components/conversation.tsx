'use client';

import { EMPTY_STATES, type EmptyStateKey } from '../lib/vocabulary';

/**
 * Comment, chat and listener pieces — E15-T03. DESIGN-REF §2.5, §2.8, §2.11.
 */

export interface CommentItemProps {
  commentId: string;
  authorLabel: string;
  body: string;
  createdAtLabel: string;
  isHelpful: boolean;
  /** Only the post's author can mark a reply helpful (PRD §9). */
  canMarkHelpful: boolean;
  onMarkHelpful?: (commentId: string) => void;
  /** Replies nest exactly one level (PRD §9). */
  replies?: CommentItemProps[];
  depth?: 0 | 1;
}

export function CommentItem({
  commentId,
  authorLabel,
  body,
  createdAtLabel,
  isHelpful,
  canMarkHelpful,
  onMarkHelpful,
  replies = [],
  depth = 0,
}: CommentItemProps) {
  return (
    <article
      className={`rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] ${
        depth === 1
          ? // The nested level is indented *and* ruled, so one level of nesting
            // is legible without a second shade of surface.
            'ml-4 rounded-l-md border-l-[3px] border-l-[var(--color-brand)]'
          : ''
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
        <span className="text-sm font-bold text-[var(--color-text)]">{authorLabel}</span>
        <time>{createdAtLabel}</time>
        {isHelpful ? (
          // The badge the author gives. Text plus an icon, never colour alone,
          // and worded as the author's own voice (DESIGN-REF §2.5). Filled
          // amber rather than outlined: this is the warmest thing that can
          // happen to a reply, and an outline made it look like metadata.
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-tint-amber)] px-2.5 py-0.5 font-bold text-[var(--color-text)]">
            <span aria-hidden="true">🤍</span>
            Jawaban ini membantu gue
          </span>
        ) : null}
      </header>

      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text)]">{body}</p>

      {canMarkHelpful && !isHelpful && onMarkHelpful ? (
        <button
          type="button"
          onClick={() => onMarkHelpful(commentId)}
          aria-label={`Tandai balasan dari ${authorLabel} sebagai membantu`}
          className="mt-3 min-h-[var(--size-touch)] rounded-full border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text)] transition-transform hover:bg-[var(--color-tint-amber)] active:scale-95"
        >
          <span aria-hidden="true">Ini membantu gue</span>
        </button>
      ) : null}

      {replies.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {replies.map((reply) => (
            <li key={reply.commentId}>
              {/* Depth is forced to 1: one level, enforced here as well as in
                  the API, so the UI cannot render something the server refuses. */}
              <CommentItem {...reply} depth={1} replies={[]} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export interface ChatBubbleProps {
  messageId: string;
  body: string;
  /** `self` is the viewer; `other` is the listener or DONG AI. */
  from: 'self' | 'other';
  /**
   * Who the other side is. Lavender is DONG AI's colour throughout the product
   * (E18-T01), so an AI reply is tinted and a human's is not — you can tell at
   * a glance whether the thing answering you is a person, without reading a
   * label. Human is the default: a person must never be painted as the AI.
   */
  tone?: 'human' | 'ai';
  timeLabel?: string;
  senderLabel?: string;
  /** True while tokens are still arriving (E09-T03). */
  streaming?: boolean;
}

/**
 * A chat bubble, room and AI alike.
 *
 * The streaming case is the one with a real constraint: the bubble must not
 * resize or reflow as tokens arrive. So the text node is appended to in place,
 * the caret is a sibling rather than part of the string, and `aria-live` is
 * `polite` on a wrapper that already exists — announcing every token as it lands
 * would make a screen reader unusable during a reply.
 */
export function ChatBubble({
  messageId,
  body,
  from,
  tone = 'human',
  timeLabel,
  senderLabel,
  streaming = false,
}: ChatBubbleProps) {
  const mine = from === 'self';

  return (
    <div
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
      data-message-id={messageId}
    >
      <div
        className={`max-w-[80%] rounded-[var(--radius-curhat)] px-4 py-2.5 ${
          mine
            ? // The tail corner is squared off on the sender's side, so the two
              // sides differ in shape and not only in colour.
              'rounded-br-md bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
            : tone === 'ai'
              ? 'rounded-bl-md bg-[var(--color-tint-lavender)] text-[var(--color-text)]'
              : 'rounded-bl-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
        }`}
      >
        {senderLabel ? (
          <span className="sr-only">{mine ? 'Kamu' : senderLabel} berkata: </span>
        ) : null}

        {/*
          `polite` and on a stable element: a bubble that became a live region
          mid-stream would re-announce the whole message on every token.
        */}
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed"
          aria-live={streaming ? 'polite' : undefined}
          aria-busy={streaming || undefined}
        >
          {body}
          {streaming ? (
            // A sibling, not appended to `body` — otherwise every token change
            // rewrites the text node and the layout jumps.
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block w-[0.5ch] animate-pulse align-baseline"
            >
              ▍
            </span>
          ) : null}
        </p>

        {timeLabel ? (
          <time
            className={`mt-1 block text-xs ${
              mine || tone === 'ai' ? 'opacity-70' : 'text-[var(--color-muted)]'
            }`}
          >
            {timeLabel}
          </time>
        ) : null}
      </div>
    </div>
  );
}

export interface ListenerCardProps {
  alias: string;
  bio?: string | null;
  topics: readonly string[];
  isAvailable: boolean;
  /** Rates over 0..1, shown as context. Never a rank (PRD §11). */
  feltHeardRate?: number | null;
  onRequest?: (alias: string) => void;
}

export function ListenerCard({
  alias,
  bio,
  topics,
  isAvailable,
  feltHeardRate,
  onRequest,
}: ListenerCardProps) {
  return (
    <article className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-[18px] shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[var(--color-text)]">{alias}</h3>

        {/* Availability says the word as well as showing a dot. */}
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 rounded-full ${
              isAvailable ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-muted)]'
            }`}
          />
          {isAvailable ? 'Siap mendengarkan' : 'Sedang nggak available'}
        </span>
      </header>

      {bio ? <p className="mt-1.5 text-sm text-[var(--color-text)]">{bio}</p> : null}

      {topics.length > 0 ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          <span className="sr-only">Topik yang biasa didengarkan: </span>
          {topics.join(' · ')}
        </p>
      ) : null}

      {typeof feltHeardRate === 'number' ? (
        // Phrased as a sentence, not a score out of five. PRD §11 forbids a
        // leaderboard, and a bare percentage next to a name is one.
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {Math.round(feltHeardRate * 100)}% orang yang ngobrol sama dia merasa didengar.
        </p>
      ) : null}

      {onRequest && isAvailable ? (
        <button
          type="button"
          onClick={() => onRequest(alias)}
          aria-label={`Minta ${alias} jadi pendengar`}
          className="mt-4 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-4 font-bold text-[var(--color-primary-fg)]"
        >
          <span aria-hidden="true">Minta didengar</span>
        </button>
      ) : null}
    </article>
  );
}

/**
 * Empty state — E15-T03.
 *
 * Copy comes from `EMPTY_STATES` so web and mobile cannot drift, and every
 * context gets its own words. "Belum ada data" is what this component exists to
 * prevent: an empty screen is the moment somebody is most likely to close the
 * app, and a system message earns that.
 */
export function EmptyState({
  context,
  onAction,
}: {
  context: EmptyStateKey;
  onAction?: () => void;
}) {
  const copy = EMPTY_STATES[context];

  return (
    <div className="rounded-[var(--radius-curhat)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-7 text-center">
      <p className="text-base font-bold text-[var(--color-text)]">{copy.title}</p>
      <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-[var(--color-muted)]">
        {copy.body}
      </p>

      {copy.action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
        >
          {copy.action}
        </button>
      ) : null}
    </div>
  );
}
