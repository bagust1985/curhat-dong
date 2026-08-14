'use client';

import {
  INTENT_LABELS,
  INTENT_VOCABULARY,
  MOODS,
  MOOD_LABELS,
  MOOD_VOCABULARY,
  type ChipShape,
  type Intent,
  type Mood,
} from '../lib/vocabulary';

/**
 * Mood, intent and category chips — E15-T02. PRD §7, §23.1; DESIGN-REF §5.
 *
 * Every chip here follows the same three rules, and they are the acceptance
 * criteria rather than house style:
 *
 *  - the glyph is `aria-hidden` and the label carries the accessible name, so a
 *    screen reader announces "Mood: patah hati" rather than "broken heart";
 *  - a shape class rides alongside the colour, because meaning must never be
 *    carried by hue alone;
 *  - anything tappable is at least 44px, which is why the picker buttons have a
 *    min-height even though the visual chip is smaller.
 */

const SHAPE_CLASS: Record<ChipShape, string> = {
  round: 'rounded-full',
  square: 'rounded-md',
  notch: 'rounded-full rounded-tl-none',
  pill: 'rounded-full px-3',
};

/** A shape-differentiated marker, so hue is never the only signal. */
function shapeClass(shape: ChipShape): string {
  return SHAPE_CLASS[shape];
}

export function MoodChip({ mood, showLabel = true }: { mood: Mood; showLabel?: boolean }) {
  const entry = MOOD_VOCABULARY[mood];

  return (
    <span
      // Filled blush against the outlined intent badge beside it, so the pair
      // reads as two different kinds of fact rather than two of the same chip.
      className={`inline-flex items-center gap-1.5 bg-[var(--color-tint-pink)] px-2.5 py-1 text-sm font-semibold text-[var(--color-text)] ${shapeClass(entry.shape)}`}
      // The visible label is redundant for sighted readers, so the whole chip
      // gets one accessible name rather than announcing glyph and text twice.
      role="img"
      aria-label={entry.a11yLabel}
    >
      <span aria-hidden="true">{entry.glyph}</span>
      {showLabel ? <span aria-hidden="true">{MOOD_LABELS[mood]}</span> : null}
    </span>
  );
}

export function IntentBadge({ intent }: { intent: Intent }) {
  const entry = INTENT_VOCABULARY[intent];

  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-[var(--color-border)] px-2.5 py-1 text-sm text-[var(--color-text)] ${shapeClass(entry.shape)}`}
      role="img"
      aria-label={entry.a11yLabel}
    >
      <span aria-hidden="true">{entry.glyph}</span>
      <span aria-hidden="true">{INTENT_LABELS[intent]}</span>
    </span>
  );
}

export function CategoryChip({
  slug,
  name,
  count,
  onSelect,
}: {
  slug: string;
  name: string;
  count?: number;
  onSelect?: (slug: string) => void;
}) {
  const label = count === undefined ? name : `${name}, ${count} curhat aktif`;

  if (!onSelect) {
    return (
      <span className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)]">
        {name}
        {count === undefined ? null : (
          <span className="ml-1.5 text-[var(--color-muted)]">{count}</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(slug)}
      aria-label={label}
      className="inline-flex min-h-[var(--size-touch)] items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] hover:border-[var(--color-brand)]"
    >
      <span aria-hidden="true">{name}</span>
      {count === undefined ? null : (
        <span aria-hidden="true" className="ml-1.5 text-[var(--color-muted)]">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The 11-mood picker.
 *
 * A radio group rather than a set of buttons: choosing a mood is picking one of
 * a known set, and a screen reader should announce "3 of 11" while arrowing
 * through. Eleven independent buttons would announce eleven unrelated controls.
 */
export function MoodPicker({
  value,
  onChange,
}: {
  value: Mood | null;
  onChange: (mood: Mood) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-[var(--color-muted)]">Sekarang rasanya gimana?</legend>

      <div role="radiogroup" aria-label="Pilih mood" className="mt-2 flex flex-wrap gap-2">
        {MOODS.map((mood) => {
          const entry = MOOD_VOCABULARY[mood];
          const selected = value === mood;

          return (
            <button
              key={mood}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={entry.a11yLabel}
              onClick={() => onChange(mood)}
              className={`inline-flex min-h-[var(--size-touch)] items-center gap-1.5 border px-3 text-sm ${shapeClass(entry.shape)} ${
                selected
                  ? // Selected state carries a ring *and* the checked role, so it
                    // is not communicated by colour alone.
                    'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold text-[var(--color-text)] ring-2 ring-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
              }`}
            >
              <span aria-hidden="true">{entry.glyph}</span>
              <span aria-hidden="true">{MOOD_LABELS[mood]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The mood strip on `/home` — E18-T01.
 *
 * Not a picker: nothing is selected and nothing is submitted here. Each chip is
 * a way *into* the composer with that mood already chosen, which is why these
 * are plain buttons rather than radios — a radio group that navigates away on
 * the first arrow key is a trap.
 *
 * It exists because the home screen used to only hand things out. Asking first
 * is the difference between a noticeboard and somewhere you sit down.
 */
export function MoodStrip({ onPick }: { onPick: (mood: Mood) => void }) {
  return (
    <section aria-labelledby="mood-strip-heading" className="flex flex-col gap-2">
      <h2 id="mood-strip-heading" className="text-sm font-bold text-[var(--color-muted)]">
        Lagi ngerasa apa hari ini?
      </h2>

      {/* -mx/px pair so the rail bleeds to the screen edge while its first and
          last chips still clear the gutter. */}
      <ul className="-mx-[var(--spacing-gutter)] flex gap-2 overflow-x-auto px-[var(--spacing-gutter)] pb-1">
        {MOODS.map((mood) => {
          const entry = MOOD_VOCABULARY[mood];

          return (
            <li key={mood} className="shrink-0">
              <button
                type="button"
                onClick={() => onPick(mood)}
                // Says where it goes, not just what it is: "Sedih" announced
                // bare sounds like a statement rather than a control.
                aria-label={`Mulai curhat dengan mood ${MOOD_LABELS[mood]}`}
                className={`inline-flex min-h-[var(--size-touch)] items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] transition-transform hover:bg-[var(--color-tint-pink)] active:scale-95 ${shapeClass(entry.shape)}`}
              >
                <span aria-hidden="true">{entry.glyph}</span>
                <span aria-hidden="true">{MOOD_LABELS[mood]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The 4 intents. Same radio-group reasoning as the mood picker. */
export function IntentSelector({
  value,
  onChange,
}: {
  value: Intent | null;
  onChange: (intent: Intent) => void;
}) {
  const intents = Object.keys(INTENT_VOCABULARY) as Intent[];

  return (
    <fieldset>
      <legend className="text-sm text-[var(--color-muted)]">Kamu sedang cari apa?</legend>

      <div role="radiogroup" aria-label="Pilih yang kamu cari" className="mt-2 flex flex-col gap-2">
        {intents.map((intent) => {
          const entry = INTENT_VOCABULARY[intent];
          const selected = value === intent;

          return (
            <button
              key={intent}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={entry.a11yLabel}
              onClick={() => onChange(intent)}
              className={`flex min-h-[var(--size-touch)] items-center gap-2 rounded-[var(--radius-curhat)] border px-3 text-left text-sm ${
                selected
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold ring-2 ring-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]'
              } text-[var(--color-text)]`}
            >
              <span aria-hidden="true">{entry.glyph}</span>
              <span aria-hidden="true">{INTENT_LABELS[intent]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface CategoryOption {
  slug: string;
  name: string;
  count?: number;
}

/**
 * Category sheet.
 *
 * A `<dialog>`-style listbox rather than a native `<select>`: the sheet also
 * shows how many active curhat each topic has, which is the number that helps
 * somebody choose where their story will actually be read.
 */
export function CategorySheet({
  categories,
  value,
  onChange,
  onClose,
}: {
  categories: CategoryOption[];
  value: string | null;
  onChange: (slug: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih topik"
      className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Topik</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pilihan topik"
          className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] rounded-full text-[var(--color-muted)]"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <ul role="listbox" aria-label="Daftar topik" className="mt-3 flex flex-wrap gap-2">
        {categories.map((category) => (
          <li key={category.slug} role="option" aria-selected={value === category.slug}>
            <CategoryChip
              slug={category.slug}
              name={category.name}
              {...(category.count === undefined ? {} : { count: category.count })}
              onSelect={onChange}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
