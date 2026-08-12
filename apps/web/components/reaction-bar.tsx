'use client';

import { REACTIONS, REACTION_LABELS, REACTION_VOCABULARY, type Reaction } from '../lib/vocabulary';

/**
 * Reactions — E15-T02. PRD §9, §23.1.
 *
 * Six empathy words, and the design constraint is that they stay *words*. A row
 * of six glyphs would collapse into a rating: the eye picks a favourite, the
 * heart becomes the default, and "aku pernah di situ" turns into approval. PRD
 * §9 is explicit that no reaction outranks another, so the label is never
 * optional and the glyph is always `aria-hidden` decoration beside it.
 *
 * Counts are hideable (`showCounts`) because a count is a scoreboard. On a feed
 * card it tells a reader "twelve people already responded, you are not needed";
 * on a detail page it tells the author "twelve people heard you". Same number,
 * opposite effect — so the caller decides.
 */

export interface ReactionBarProps {
  counts: Partial<Record<Reaction, number>>;
  /** Which reactions the viewer has already given. */
  mine: readonly Reaction[];
  onToggle: (reaction: Reaction) => void;
  /** Off on feed cards, on for the author's own detail view. */
  showCounts?: boolean;
  disabled?: boolean;
}

export function ReactionBar({
  counts,
  mine,
  onToggle,
  showCounts = false,
  disabled = false,
}: ReactionBarProps) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Reaksi">
      {REACTIONS.map((reaction) => {
        const entry = REACTION_VOCABULARY[reaction];
        const count = counts[reaction] ?? 0;
        const given = mine.includes(reaction);

        // The accessible name carries the state, because a filled background is
        // invisible to a screen reader and `aria-pressed` alone announces
        // "pressed" without saying what was pressed.
        const label = showCounts
          ? `${entry.a11yLabel}${given ? ', sudah kamu beri' : ''}, ${count} orang`
          : `${entry.a11yLabel}${given ? ', sudah kamu beri' : ''}`;

        return (
          <li key={reaction}>
            <button
              type="button"
              onClick={() => onToggle(reaction)}
              disabled={disabled}
              aria-pressed={given}
              aria-label={label}
              className={`inline-flex min-h-[var(--size-touch)] items-center gap-1.5 rounded-full border px-3 text-sm ${
                given
                  ? // Border weight and font weight change too — the filled
                    // background is not the only signal.
                    'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
              } disabled:opacity-60`}
            >
              <span aria-hidden="true">{entry.glyph}</span>
              {/* The word, always. This is what keeps it from being a like. */}
              <span aria-hidden="true">{REACTION_LABELS[reaction]}</span>
              {showCounts && count > 0 ? (
                <span aria-hidden="true" className="text-[var(--color-muted)]">
                  {count}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Long-press picker — DESIGN-REF §2.17.
 *
 * Renders the same six words in a sheet. Deliberately not a compact glyph strip:
 * a picker is where somebody is choosing deliberately, which is the worst moment
 * to make them guess what an icon means.
 */
export function ReactionPicker({
  mine,
  onPick,
  onClose,
}: {
  mine: readonly Reaction[];
  onPick: (reaction: Reaction) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih reaksi"
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Kirim reaksi</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pilihan reaksi"
          className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] rounded-full text-[var(--color-muted)]"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Nggak ada yang lebih penting dari yang lain. Pilih yang paling jujur.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {REACTIONS.map((reaction) => {
          const entry = REACTION_VOCABULARY[reaction];
          const given = mine.includes(reaction);

          return (
            <li key={reaction}>
              <button
                type="button"
                onClick={() => onPick(reaction)}
                aria-pressed={given}
                aria-label={`${entry.a11yLabel}${given ? ', sudah kamu beri' : ''}`}
                className={`flex min-h-[var(--size-touch)] w-full items-center gap-2 rounded-[var(--radius-curhat)] border px-3 text-left text-sm ${
                  given
                    ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                } text-[var(--color-text)]`}
              >
                <span aria-hidden="true">{entry.glyph}</span>
                <span aria-hidden="true">{REACTION_LABELS[reaction]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
