import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

/**
 * Shared primitives — Revisi 2 (Aug 2026), extended in E18-T01.
 *
 * The color rules these classes encode are load-bearing and asserted by
 * lib/contrast.test.ts: `--color-primary-fg` sits on `--color-primary`
 * (white on #C2185B, 5.87:1) and never on `--color-brand` (white on #FA4B7D is
 * 3.30:1 — large text, icons, outlines and dark-ink fills only). Changing a
 * variant's background means re-checking those numbers, not eyeballing them.
 *
 * These exist because the app had 33 hand-styled inputs and the same two class
 * strings copied a dozen times each; a restyle that has to find all of them by
 * grep is a restyle that misses some.
 */

/**
 * The wordmark, rebuilt in HTML rather than shipped as an image: crisp at any
 * size and theme-aware — "curhat" in ink, "dong" on the brand's pink pill.
 *
 * Dark ink on that pink, never white: white on `--color-brand` is 3.30:1 and
 * lib/contrast.test.ts fails the build over it.
 *
 * Lives here rather than in landing.tsx because the auth screens need it too,
 * and a brand mark with two definitions has two futures.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={['inline-flex items-baseline gap-1 text-xl font-black lowercase', className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="text-[var(--color-text)]">curhat</span>
      <span className="rounded-[var(--radius-chip)] bg-[var(--color-brand)] px-2 py-0.5 text-base text-[var(--color-accent-fg)]">
        dong
      </span>
    </span>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_BASE =
  'inline-flex min-h-[var(--size-touch)] items-center justify-center gap-2 rounded-[var(--radius-chip)] px-6 font-bold transition-opacity disabled:opacity-60';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]',
  secondary:
    'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]',
  ghost: 'text-[var(--color-text)] underline underline-offset-4',
};

export function buttonClasses(variant: ButtonVariant, extra?: string): string {
  return [BUTTON_BASE, BUTTON_VARIANTS[variant], extra].filter(Boolean).join(' ');
}

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  href?: undefined;
};

type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  href: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Pill button. Renders an `<a>` when given `href` — a navigation styled as a
 * button should still be a link to the browser and the screen reader.
 */
export function Button(props: ButtonProps) {
  const { variant = 'primary', className, ...rest } = props;
  const classes = buttonClasses(variant, className);

  if ('href' in rest && typeof rest.href === 'string') {
    return <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />;
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type={buttonRest.type ?? 'button'} {...buttonRest} className={classes} />;
}

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Renders as a different element when the card is a landmark (e.g. 'section'). */
  as?: 'div' | 'section' | 'article';
  /**
   * Lifts the card off the ground with a rose-tinted shadow instead of a
   * hairline. Used by the feed, where a column of identically-outlined boxes is
   * what made the old screen read as a list rather than a set of separate
   * stories.
   */
  lifted?: boolean;
  'aria-labelledby'?: string;
}

/** Soft-cornered surface. */
export function Card({ children, className, as: Tag = 'div', lifted, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={[
        'rounded-[var(--radius-curhat)] bg-[var(--color-surface)]',
        lifted
          ? // The transparent border keeps the box model identical either way,
            // so a lifted card and a bordered one line up in the same column.
            'border border-transparent shadow-[var(--shadow-card)]'
          : 'border border-[var(--color-border)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  );
}

/**
 * Text fields.
 *
 * One class string instead of seventeen copies. Fields keep the card radius
 * rather than the pill: a pill-shaped multi-line input has nowhere to put the
 * text.
 */
const FIELD_BASE =
  'w-full min-h-[var(--size-touch)] rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[var(--color-text)] placeholder:text-[var(--color-muted)] disabled:opacity-60';

export function fieldClasses(extra?: string): string {
  return [FIELD_BASE, extra].filter(Boolean).join(' ');
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: InputProps) {
  return <input {...rest} className={fieldClasses(className)} />;
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea {...rest} className={fieldClasses(className)} />;
}

/**
 * Small standing label — a count, a state, a topic.
 *
 * `brand` and `amber` are fills, so they take `accent-fg` (the dark plum) and
 * never `primary-fg`. That is the rule from lib/tokens.ts expressed as code
 * rather than as a comment somebody has to remember.
 */
export type BadgeTone = 'brand' | 'amber' | 'lavender' | 'muted';

const BADGE_TONES: Record<BadgeTone, string> = {
  brand: 'bg-[var(--color-brand)] text-[var(--color-accent-fg)]',
  amber: 'bg-[var(--color-accent-amber)] text-[var(--color-accent-fg)]',
  lavender: 'bg-[var(--color-tint-lavender)] text-[var(--color-text)]',
  muted: 'border border-[var(--color-border)] text-[var(--color-muted)]',
};

export function Badge({
  tone = 'brand',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] px-3 py-0.5 text-xs font-bold',
        BADGE_TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
