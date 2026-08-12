'use client';

import { IntentBadge, MoodChip } from './chips';
import type { Intent, Mood } from '../lib/vocabulary';

/**
 * The feed card — E15-T02. DESIGN-REF §2.4, §5.
 *
 * Four variants, and the differences are about honesty rather than decoration:
 *
 *  - `default` — an ordinary published curhat;
 *  - `butuh-didengar` — few or no replies and recent (TECH-SPEC §4.7). Marked so
 *    a reader can choose to go where they are needed, never framed as urgent
 *    pressure on the author;
 *  - `anonymous` — shows the per-post code, never an alias. The code is random
 *    per post (E04-T04), so two anonymous cards cannot be tied together;
 *  - `held` — visible only to its author while under review, and it says so
 *    plainly instead of looking published.
 *
 * There is no follower count, no view count and no ranking anywhere on this card
 * (PRD §11). Reply count appears because it drives "Butuh Didengar" and helps a
 * reader decide where to go; nothing else is counted.
 */

export type CurhatCardVariant = 'default' | 'butuh-didengar' | 'anonymous' | 'held';

export interface CurhatCardProps {
  postId: string;
  title?: string | null;
  excerpt: string;
  mood: Mood;
  intent: Intent;
  categoryName: string;
  /** Alias, or `Anonymous #code` when anonymous. */
  authorLabel: string;
  isAnonymous: boolean;
  replyCount: number;
  createdAtLabel: string;
  variant?: CurhatCardVariant;
  onOpen?: (postId: string) => void;
}

/** Copy for the states a reader could otherwise misread. */
const VARIANT_NOTICE: Partial<Record<CurhatCardVariant, string>> = {
  'butuh-didengar': 'Belum banyak yang balas. Kalau kamu punya waktu sebentar.',
  held: 'Curhatmu kami tinjau dulu sebentar ya. Baru kamu yang bisa lihat ini.',
};

export function CurhatCard({
  postId,
  title,
  excerpt,
  mood,
  intent,
  categoryName,
  authorLabel,
  isAnonymous,
  replyCount,
  createdAtLabel,
  variant = 'default',
  onOpen,
}: CurhatCardProps) {
  const notice = VARIANT_NOTICE[variant];

  return (
    <article
      className={`rounded-[var(--radius-curhat)] border bg-[var(--color-surface)] p-4 ${
        variant === 'butuh-didengar'
          ? // A left edge plus the notice text below — the accent is never the
            // only thing distinguishing this variant.
            'border-[var(--color-border)] border-l-4 border-l-[var(--color-accent-amber)]'
          : variant === 'held'
            ? 'border-dashed border-[var(--color-muted)]'
            : 'border-[var(--color-border)]'
      }`}
      // Labelled by its own heading, so a screen reader announces the card as a
      // unit rather than a loose run of text.
      aria-labelledby={`curhat-${postId}-heading`}
    >
      <header className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <span>
          {isAnonymous ? (
            <>
              <span className="sr-only">Ditulis anonim, kode </span>
              {authorLabel}
            </>
          ) : (
            authorLabel
          )}
        </span>
        <span aria-hidden="true">·</span>
        <span>{categoryName}</span>
        <span aria-hidden="true">·</span>
        <time>{createdAtLabel}</time>
      </header>

      <h3
        id={`curhat-${postId}-heading`}
        className="mt-2 text-base font-semibold text-[var(--color-text)]"
      >
        {title ?? excerpt.slice(0, 60)}
      </h3>

      <p className="mt-1 text-sm leading-relaxed text-[var(--color-text)]">{excerpt}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MoodChip mood={mood} />
        <IntentBadge intent={intent} />
      </div>

      {notice ? (
        <p
          className={`mt-3 text-sm ${
            variant === 'held' ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'
          }`}
        >
          {notice}
        </p>
      ) : null}

      <footer className="mt-3 flex items-center justify-between">
        <span className="text-sm text-[var(--color-muted)]">
          {replyCount === 0 ? (
            'Belum ada balasan'
          ) : (
            <>
              {replyCount} balasan<span className="sr-only"> dari orang lain</span>
            </>
          )}
        </span>

        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(postId)}
            // The accessible name says which curhat, because a feed of cards
            // otherwise announces "Baca selengkapnya" twenty times.
            aria-label={`Baca curhat: ${title ?? excerpt.slice(0, 40)}`}
            className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-4 text-sm font-semibold text-[var(--color-text)]"
          >
            <span aria-hidden="true">Baca</span>
          </button>
        ) : null}
      </footer>
    </article>
  );
}
