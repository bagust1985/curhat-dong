import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Shared primitives — Revisi 2 (Aug 2026), extracted for the mock-driven
 * restyle so every screen stops hand-rolling the same pill button.
 *
 * The color rules these classes encode are load-bearing and asserted by
 * lib/contrast.test.ts: white text sits on `--color-primary` (#5B3BE0,
 * 6.67:1) and never on `--color-brand` (#7C5CFC, 4.38:1 — icons and large
 * text only) nor on pink. Changing a variant's background means re-checking
 * those numbers, not eyeballing them.
 */

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
  'aria-labelledby'?: string;
}

/** Soft-cornered surface — the mock's white card on lavender ground. */
export function Card({ children, className, as: Tag = 'div', ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={[
        'rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  );
}
