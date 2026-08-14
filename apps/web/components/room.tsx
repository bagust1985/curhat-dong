'use client';

import { useState } from 'react';

import { ChatBubble } from './conversation';
import { Textarea } from './ui';

/**
 * Private room pieces — E15-T14. DESIGN-REF §2.10, §2.11, PRD §11.
 *
 * Two rules from the task drive the shape:
 *
 *  - **Escalate is always visible.** Not behind a "⋯" menu. The moment it is
 *    needed is the moment nobody is going to go looking for it;
 *  - **the searching state promises nothing.** No "we will find someone", no
 *    countdown implying success. There may be nobody available, and a promise
 *    that fails is worse than an honest wait.
 */

export function SearchingState({
  estimateLabel,
  onCancel,
}: {
  estimateLabel: string;
  onCancel: () => void;
}) {
  return (
    <section aria-labelledby="searching-heading" className="text-center">
      {/*
        A breathing indicator, because the honest version of this screen has no
        progress to show — there may be nobody. It says "still looking", which
        is true, rather than "almost there", which would not be.
        prefers-reduced-motion stops it globally (globals.css).
      */}
      <span aria-hidden="true" className="inline-flex gap-1.5">
        <span className="size-2.5 animate-bounce rounded-full bg-[var(--color-primary)]" />
        <span className="size-2.5 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:120ms]" />
        <span className="size-2.5 animate-bounce rounded-full bg-[var(--color-primary)] [animation-delay:240ms]" />
      </span>

      <h1
        id="searching-heading"
        className="mt-5 text-2xl font-black text-balance text-[var(--color-text)]"
      >
        Lagi nyariin orang yang tepat buat dengerin kamu…
      </h1>
      <p role="status" className="mt-3 text-sm text-[var(--color-muted)]">
        {estimateLabel}
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Kamu boleh tutup halaman ini — kalau ketemu, kami kabarin.
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-6 min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
      >
        Batalin pencarian
      </button>
    </section>
  );
}

export interface MatchFailureAlternative {
  label: string;
  onSelect: () => void;
}

/**
 * Nobody was found.
 *
 * Empathy, then three concrete alternatives, and no promise that waiting longer
 * would have worked. "Coba lagi nanti, pasti ada" is the kind of sentence that
 * makes the next failure hurt more.
 */
export function MatchFailedState({
  alternatives,
}: {
  alternatives: readonly MatchFailureAlternative[];
}) {
  return (
    <section aria-labelledby="failed-heading">
      <h1 id="failed-heading" className="text-2xl font-black text-[var(--color-text)]">
        Belum ada yang bisa nemenin sekarang
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
        Bukan karena ceritamu nggak penting. Malam-malam gini kadang yang lagi siap dengerin
        memang lagi sedikit.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {alternatives.map((alternative) => (
          <li key={alternative.label}>
            <button
              type="button"
              onClick={alternative.onSelect}
              className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 font-semibold text-[var(--color-text)]"
            >
              {alternative.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoomHeader({
  counterpartAlias,
  role,
  online,
  canEscalate,
  onReport,
  onBlock,
  onEnd,
  onEscalate,
}: {
  counterpartAlias: string;
  role: 'requester' | 'listener';
  online: boolean;
  canEscalate: boolean;
  onReport: () => void;
  onBlock: () => void;
  onEnd: () => void;
  onEscalate: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
      <div>
        <p className="font-semibold text-[var(--color-text)]">
          {counterpartAlias}
          <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
            {role === 'requester' ? 'Listener' : 'Yang cerita'}
          </span>
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          {online ? 'Lagi online' : 'Lagi nggak aktif'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canEscalate ? (
          // Always rendered, never inside a menu. See the note at the top.
          <button
            type="button"
            onClick={onEscalate}
            // Ink as well as outline. Everything else in this header is a
            // muted link; the safety valve should not have to compete with
            // "Report" for a glance at the moment it is needed.
            className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border-[1.5px] border-[var(--color-danger)] px-5 text-sm font-bold text-[var(--color-danger)]"
          >
            Escalate
          </button>
        ) : null}
        <button
          type="button"
          onClick={onReport}
          className="min-h-[var(--size-touch)] px-2 text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Report
        </button>
        <button
          type="button"
          onClick={onBlock}
          className="min-h-[var(--size-touch)] px-2 text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Block
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="min-h-[var(--size-touch)] px-2 text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Akhiri sesi
        </button>
      </div>
    </header>
  );
}

/** Shown once per room, and it does not over-promise (E11-T06, PRD §15). */
export function SafetyNotice({ text, onAcknowledge }: { text: string; onAcknowledge: () => void }) {
  return (
    <div
      role="note"
      className="rounded-[var(--radius-curhat)] bg-[var(--color-tint-amber)] p-5"
    >
      <p className="text-sm leading-relaxed text-[var(--color-text)]">{text}</p>
      <button
        type="button"
        onClick={onAcknowledge}
        className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-primary-fg)]"
      >
        Aku ngerti
      </button>
    </div>
  );
}

export interface RoomMessage {
  id: string;
  body: string;
  fromMe: boolean;
  senderAlias: string;
  timeLabel: string;
}

export function RoomTranscript({
  messages,
  typingAlias,
}: {
  messages: readonly RoomMessage[];
  typingAlias: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <ChatBubble
          key={message.id}
          messageId={message.id}
          body={message.body}
          from={message.fromMe ? 'self' : 'other'}
          senderLabel={message.senderAlias}
          timeLabel={message.timeLabel}
        />
      ))}

      {typingAlias ? (
        <p role="status" className="text-sm text-[var(--color-muted)]">
          {typingAlias} lagi ngetik…
        </p>
      ) : null}
    </div>
  );
}

/**
 * Session feedback — PRD §11, DESIGN-REF §2.11b.
 *
 * Two different questions for two different roles. The requester is asked
 * whether they felt heard (the North Star); the listener is asked whether the
 * conversation was safe, which is a safety signal and not a rating of the
 * person they talked to.
 */
export function SessionFeedback({
  role,
  onSubmit,
}: {
  role: 'requester' | 'listener';
  onSubmit: (payload: { feltHeard?: 'yes' | 'somewhat' | 'no'; feltSafe?: boolean; note?: string }) => void;
}) {
  const [feltSafe, setFeltSafe] = useState<boolean | null>(null);
  const [note, setNote] = useState('');

  if (role === 'requester') {
    return (
      // The same warm ground as the Felt Heard sheet on a post: this is the
      // same question, and it is the one the whole product is measured on. It
      // should look like the app leaning in, not like an exit survey.
      <section
        aria-labelledby="feedback-heading"
        className="rounded-[var(--radius-curhat)] bg-[var(--color-tint-pink)] p-5"
      >
        <h2 id="feedback-heading" className="text-xl font-black text-[var(--color-text)]">
          Kamu merasa didengar?
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {(
            [
              ['yes', 'Iya'],
              ['somewhat', 'Sedikit'],
              ['no', 'Belum'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onSubmit({ feltHeard: value })}
              // All three identical. Making "Belum" quieter than "Iya" would
              // tilt the North Star metric through styling alone.
              className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-left font-semibold text-[var(--color-text)] transition-transform active:scale-[0.98]"
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="feedback-heading">
      <h2 id="feedback-heading" className="text-xl font-black text-[var(--color-text)]">
        Percakapan berjalan aman?
      </h2>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit({ feltSafe: true })}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] border border-[var(--color-border)] px-5 font-semibold text-[var(--color-text)]"
        >
          Ya
        </button>
        <button
          type="button"
          onClick={() => setFeltSafe(false)}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] border border-[var(--color-border)] px-5 font-semibold text-[var(--color-text)]"
        >
          Nggak
        </button>
      </div>

      {feltSafe === false ? (
        <div className="mt-4">
          <label htmlFor="feedback-note" className="block text-sm font-semibold text-[var(--color-text)]">
            Boleh cerita sedikit apa yang terjadi?
          </label>
          <Textarea
            id="feedback-note"
            rows={3}
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2"
          />
          <button
            type="button"
            onClick={() =>
              onSubmit({ feltSafe: false, ...(note.trim() ? { note: note.trim() } : {}) })
            }
            className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
          >
            Kirim
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ThankYouState({ role, onHome }: { role: 'requester' | 'listener'; onHome: () => void }) {
  return (
    <section aria-labelledby="thanks-heading" className="text-center">
      <h2 id="thanks-heading" className="text-2xl font-black text-[var(--color-text)]">
        {role === 'listener' ? 'Makasih udah mau dengerin 🤍' : 'Makasih udah mau cerita 🤍'}
      </h2>
      <button
        type="button"
        onClick={onHome}
        className="mt-6 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
      >
        Balik ke beranda
      </button>
    </section>
  );
}
