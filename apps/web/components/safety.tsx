'use client';

import { useId, useState } from 'react';
import { REPORT_CATEGORIES, REPORT_CATEGORY_LABELS, type ReportCategory } from '@curhat/types';

/**
 * Safety components — E15-T04. PRD §9, §15, §15.1, §15.2; DESIGN-REF §2.7, §2.17.
 *
 * The most carefully worded components in the product. Each one is where copy
 * stops being decoration and starts changing what somebody does.
 */

/**
 * Felt Heard — PRD §9, the North Star prompt.
 *
 * The dismiss option is the point. `Dismiss` is not "Belum" and not "Tidak": a
 * dismissed prompt is excluded from the metric entirely (E06-T06), because
 * counting it as negative would make the North Star measure how annoying the
 * prompt is rather than whether anyone felt heard. So the sheet offers three
 * real answers *and* a clearly separate way out — and the way out never looks
 * like a fourth answer.
 */
export function FeltHeardSheet({
  onAnswer,
  onDismiss,
}: {
  onAnswer: (answer: 'yes' | 'somewhat' | 'no') => void;
  onDismiss: () => void;
}) {
  const headingId = useId();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      // The one question the whole product is measured on, so it gets the warm
      // ground rather than another white card — it should read as the app
      // leaning in, not as a survey that appeared.
      className="rounded-[var(--radius-curhat)] bg-[var(--color-tint-pink)] p-5"
    >
      <h2 id={headingId} className="text-base font-bold text-[var(--color-text)]">
        Setelah baca balasan yang masuk, kamu merasa didengar?
      </h2>
      <p className="mt-1.5 text-sm text-[var(--color-text)] opacity-80">
        Jawaban kamu cuma buat kami, nggak kelihatan ke siapa pun.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {(
          [
            ['yes', 'Iya, lumayan bikin lega'],
            ['somewhat', 'Sedikit'],
            ['no', 'Belum, sih'],
          ] as const
        ).map(([answer, label]) => (
          <button
            key={answer}
            type="button"
            onClick={() => onAnswer(answer)}
            // All three weighted identically. "Belum, sih" styled any quieter
            // than "Iya" would bend the North Star metric by design.
            className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-left text-sm font-semibold text-[var(--color-text)] transition-transform active:scale-[0.98]"
          >
            {label}
          </button>
        ))}
      </div>

      {/*
        Visually separated and worded as "not now", not as an answer. A dismiss
        that sits in the same stack as the three options gets tapped as if it
        were "no", and then the metric is wrong in the direction that matters.
      */}
      <div className="mt-4 border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Lewati pertanyaan ini, jangan hitung sebagai jawaban"
          className="min-h-[var(--size-touch)] w-full text-sm text-[var(--color-muted)] underline"
        >
          <span aria-hidden="true">Nggak sekarang</span>
        </button>
      </div>
    </div>
  );
}

/** Report sheet — 10 categories (PRD §15). */
export function ReportSheet({
  onSubmit,
  onClose,
}: {
  onSubmit: (category: ReportCategory, note: string) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <h2 id={headingId} className="text-base font-semibold text-[var(--color-text)]">
        Laporkan ini
      </h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Pilih yang paling mendekati. Laporanmu nggak kelihatan ke orang yang kamu laporkan.
      </p>

      <fieldset className="mt-3">
        <legend className="sr-only">Kategori laporan</legend>
        <div role="radiogroup" aria-label="Kategori laporan" className="flex flex-col gap-1.5">
          {REPORT_CATEGORIES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={category === value}
              onClick={() => setCategory(value)}
              className={`min-h-[var(--size-touch)] rounded-[var(--radius-curhat)] border px-3 text-left text-sm ${
                category === value
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold ring-2 ring-[var(--color-primary)]'
                  : 'border-[var(--color-border)]'
              } text-[var(--color-text)]`}
            >
              {REPORT_CATEGORY_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 block text-sm text-[var(--color-muted)]">
        Catatan (opsional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={1000}
          className="mt-1 w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-sm text-[var(--color-text)]"
        />
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={category === null}
          onClick={() => category && onSubmit(category, note)}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] bg-[var(--color-primary)] text-sm font-semibold text-[var(--color-primary-fg)] disabled:opacity-50"
        >
          Kirim laporan
        </button>
      </div>
    </div>
  );
}

/**
 * The consequences of blocking, stated honestly — PRD §15.
 *
 * Block is mutual and total: neither sees the other, no matching, no comments.
 * Listing that plainly matters because somebody blocking in anger deserves to
 * know they are also giving something up, and somebody blocking out of fear
 * deserves to know it actually works.
 */
export const BLOCK_CONSEQUENCES: readonly string[] = [
  'Kamu dan dia nggak akan saling lihat curhat atau komentar lagi.',
  'Kalian nggak akan dicocokkan sebagai listener satu sama lain.',
  'Kalau sedang ada ruang ngobrol berjalan, ruangnya ditutup.',
  'Dia nggak diberi tahu kalau kamu memblokir.',
];

export function BlockDialog({
  alias,
  onConfirm,
  onCancel,
}: {
  alias: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headingId = useId();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <h2 id={headingId} className="text-base font-semibold text-[var(--color-text)]">
        Blokir {alias}?
      </h2>

      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--color-text)]">
        {BLOCK_CONSEQUENCES.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true">·</span>
            {line}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Kamu bisa membatalkan blokir kapan pun dari Settings.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] bg-[var(--color-danger)] text-sm font-semibold text-[var(--color-danger-fg)]"
        >
          Blokir
        </button>
      </div>
    </div>
  );
}

export interface SupportResource {
  name: string;
  channel: 'phone' | 'chat' | 'whatsapp' | 'web';
  value: string;
  hours: string;
}

/**
 * A hotline card that can actually be dialled — PRD §15.2.
 *
 * The href is the whole point of this component. Somebody on the Level 3 screen
 * should not have to select a phone number and paste it into a dialler; on a
 * phone browser `tel:` opens the keypad with the number already there.
 */
export function SafetyResourceCard({ resource }: { resource: SupportResource }) {
  const href =
    resource.channel === 'phone'
      ? `tel:${resource.value.replace(/[^\d+]/g, '')}`
      : resource.channel === 'whatsapp'
        ? `https://wa.me/${resource.value.replace(/[^\d]/g, '')}`
        : resource.value;

  const actionLabel =
    resource.channel === 'phone'
      ? 'Telepon'
      : resource.channel === 'whatsapp'
        ? 'Chat WhatsApp'
        : 'Buka';

  return (
    <a
      href={href}
      {...(resource.channel === 'web' || resource.channel === 'chat'
        ? { target: '_blank', rel: 'noreferrer noopener' }
        : {})}
      aria-label={`${actionLabel} ${resource.name}, ${resource.value}, jam ${resource.hours}`}
      className="flex min-h-[var(--size-touch)] flex-col rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 no-underline"
    >
      <span className="text-base font-semibold text-[var(--color-text)]" aria-hidden="true">
        {resource.name}
      </span>
      <span className="text-sm text-[var(--color-text)]" aria-hidden="true">
        {resource.value}
      </span>
      <span className="text-sm text-[var(--color-muted)]" aria-hidden="true">
        {resource.hours} · {actionLabel}
      </span>
    </a>
  );
}

/**
 * Double confirmation for something irreversible — DESIGN-REF §2.16.
 *
 * Two rules, both from the task:
 *
 *  - the consequences are rendered **above** the buttons, always. A confirm
 *    dialog that explains itself after the button is a dialog people have
 *    already dismissed;
 *  - irreversible actions need the phrase typed. A single tap is too little
 *    friction for something with no way back, and a checkbox is a single tap.
 */
export function DestructiveConfirm({
  title,
  consequences,
  confirmPhrase,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  consequences: readonly string[];
  /** When set, the exact phrase must be typed before confirming. */
  confirmPhrase?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState('');

  const unlocked = confirmPhrase === undefined || typed.trim() === confirmPhrase;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="rounded-[var(--radius-curhat)] border border-[var(--color-danger)] bg-[var(--color-surface)] p-4"
    >
      <h2 id={headingId} className="text-base font-semibold text-[var(--color-text)]">
        {title}
      </h2>

      {/* Consequences first. This ordering is the acceptance criterion. */}
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--color-text)]">
        {consequences.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true">·</span>
            {line}
          </li>
        ))}
      </ul>

      {confirmPhrase === undefined ? null : (
        <label htmlFor={inputId} className="mt-3 block text-sm text-[var(--color-muted)]">
          Ketik <strong className="text-[var(--color-text)]">{confirmPhrase}</strong> untuk
          melanjutkan
          <input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="mt-1 w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-sm text-[var(--color-text)]"
          />
        </label>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)]"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={!unlocked}
          onClick={onConfirm}
          className="min-h-[var(--size-touch)] flex-1 rounded-[var(--radius-action)] bg-[var(--color-danger)] text-sm font-semibold text-[var(--color-danger-fg)] disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
