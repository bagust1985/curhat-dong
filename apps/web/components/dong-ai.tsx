'use client';

import { ChatBubble } from './conversation';
import type { SupportiveInterventionData } from './supportive-intervention';

/**
 * DONG AI pieces — E15-T12. DESIGN-REF §2.8, PRD §10.
 *
 * The disclaimer is a component rather than a line of copy inside the chat
 * because it must be visible at all times, not only at the top of a scrolled
 * thread. Somebody who joins a conversation at message forty should still be
 * able to see what they are talking to.
 */

export const AI_DISCLAIMER_FALLBACK = 'DONG AI teman ngobrol, bukan psikolog.';

export function AiDisclaimer({ text }: { text?: string }) {
  return (
    <p
      // `role="note"` and always rendered — never inside a dismissable banner.
      role="note"
      className="rounded-[var(--radius-chip)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-center text-xs text-[var(--color-text)]"
    >
      {text && text.length > 0 ? text : AI_DISCLAIMER_FALLBACK}
    </p>
  );
}

export interface PersonalityOption {
  mode: string;
  label: string;
  description: string;
  available: boolean;
}

export function PersonalityPicker({
  options,
  value,
  onChange,
}: {
  options: readonly PersonalityOption[];
  value: string | null;
  onChange: (mode: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Pilih gaya DONG" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={value === option.mode}
          disabled={!option.available}
          aria-label={
            option.available
              ? `${option.label}: ${option.description}`
              : `${option.label} — belum tersedia`
          }
          onClick={() => onChange(option.mode)}
          className={`min-h-[var(--size-touch)] rounded-[var(--radius-chip)] border px-4 text-sm ${
            value === option.mode
              ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold text-[var(--color-text)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
          } disabled:opacity-45`}
        >
          <span aria-hidden="true">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The three dots while a reply is being generated. */
export function TypingIndicator() {
  return (
    <p role="status" className="text-sm text-[var(--color-muted)]">
      <span className="sr-only">DONG lagi ngetik…</span>
      <span aria-hidden="true" className="inline-flex gap-1">
        <span className="size-2 animate-bounce rounded-full bg-[var(--color-muted)]" />
        <span className="size-2 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:120ms]" />
        <span className="size-2 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:240ms]" />
      </span>
    </p>
  );
}

export interface BridgeCardData {
  message: string;
  ctaLabel: string;
  action: 'find_listener';
  prefill: { topic?: string; emotion?: string };
}

/**
 * AI → human bridge.
 *
 * Shown when the server decides to (`decideBridge`), not after every reply.
 * A card that appears on every turn stops being an offer and becomes the AI
 * repeatedly telling somebody to go somewhere else.
 */
export function BridgeCard({ card, onAccept }: { card: BridgeCardData; onAccept: () => void }) {
  return (
    <section
      aria-labelledby="bridge-heading"
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4"
    >
      <h2 id="bridge-heading" className="text-sm font-semibold text-[var(--color-text)]">
        {card.message}
      </h2>
      <button
        type="button"
        onClick={onAccept}
        className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary-fg)]"
      >
        {card.ctaLabel}
      </button>
    </section>
  );
}

/**
 * Quota indicator, and the screen when it runs out.
 *
 * The exhausted state is warm and points at a person, because "you have used
 * your free messages" said coldly at 2am is the moment somebody closes the app.
 */
export function QuotaNotice({
  remaining,
  limit,
  onFindListener,
}: {
  remaining: number;
  limit: number;
  onFindListener: () => void;
}) {
  if (remaining > 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Sisa {remaining} pesan hari ini dari {limit}.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="quota-heading"
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <h2 id="quota-heading" className="text-base font-semibold text-[var(--color-text)]">
        Jatah ngobrol sama DONG hari ini udah habis
      </h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Bukan karena kamu kebanyakan cerita. Besok jatahnya balik lagi — dan kalau malam ini masih
        berat, ada orang yang bisa dengerin.
      </p>
      <button
        type="button"
        onClick={onFindListener}
        className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary-fg)]"
      >
        Cari Listener
      </button>
    </section>
  );
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  createdAtLabel: string;
}

export function MessageList({
  messages,
  streaming,
}: {
  messages: readonly ChatMessage[];
  streaming: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <ChatBubble
          key={message.id}
          messageId={message.id}
          body={message.body}
          from={message.role === 'user' ? 'self' : 'other'}
          senderLabel={message.role === 'user' ? 'Kamu' : 'DONG'}
          timeLabel={message.createdAtLabel}
        />
      ))}

      {streaming !== null ? (
        <ChatBubble
          messageId="streaming"
          body={streaming}
          from="other"
          senderLabel="DONG"
          streaming
        />
      ) : null}
    </div>
  );
}

export type { SupportiveInterventionData };
