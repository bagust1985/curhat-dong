import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge, Button, Card, Input, Textarea, buttonClasses } from './ui';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * Shared primitives — Revisi 2.
 */
describe('Button', () => {
  it('is a real <button> by default and a real <a> when it navigates', () => {
    render(
      <>
        <Button>Simpan</Button>
        <Button href="/auth">Mulai Curhat</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Simpan' }).tagName).toBe('BUTTON');
    const link = screen.getByRole('link', { name: 'Mulai Curhat' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/auth');
  });

  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Aksi</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('meets the touch floor in every variant', () => {
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses(variant)).toContain('min-h-[var(--size-touch)]');
    }
  });

  it('puts white text only on primary — never on the brand pink', () => {
    // The contrast rule as a class-level assertion: primary-fg (white in
    // light theme) may only pair with --color-primary. A variant painting
    // --color-brand behind primary-fg would fail AA (lib/tokens.ts).
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      const classes = buttonClasses(variant);
      if (classes.includes('text-[var(--color-primary-fg)]')) {
        expect(classes).toContain('bg-[var(--color-primary)]');
        expect(classes).not.toContain('var(--color-brand)');
      }
    }
  });
});

describe('Badge', () => {
  it('never carries primary-fg on a brand or amber fill', () => {
    // Both are bright fills. White on either fails AA, so they take the dark
    // plum ink — the same rule lib/contrast.test.ts asserts numerically.
    for (const tone of ['brand', 'amber'] as const) {
      render(<Badge tone={tone}>3</Badge>);
      const badge = screen.getByText('3');
      expect(badge.className).toContain('text-[var(--color-accent-fg)]');
      expect(badge.className).not.toContain('text-[var(--color-primary-fg)]');
      document.body.innerHTML = '';
    }
  });
});

describe('fields', () => {
  it('holds the touch floor and stays legible when disabled', () => {
    render(<Input aria-label="Alias" disabled />);
    const input = screen.getByLabelText('Alias');
    expect(input.className).toContain('min-h-[var(--size-touch)]');
    // 60% rather than the browser default, which on a pink ground washes the
    // text out to roughly nothing.
    expect(input.className).toContain('disabled:opacity-60');
  });

  it('gives inputs and textareas the same shape', () => {
    render(
      <>
        <Input aria-label="Judul" />
        <Textarea aria-label="Cerita" />
      </>,
    );
    expect(screen.getByLabelText('Judul').className).toBe(
      screen.getByLabelText('Cerita').className,
    );
  });
});

describe('Card', () => {
  it('renders children on a rounded surface', () => {
    render(<Card>isi kartu</Card>);
    const card = screen.getByText('isi kartu');
    expect(card.className).toContain('rounded-[var(--radius-curhat)]');
    expect(card.className).toContain('bg-[var(--color-surface)]');
  });

  it('can become a labelled section landmark', () => {
    render(
      <Card as="section" aria-labelledby="judul">
        <h2 id="judul">Bagian</h2>
      </Card>,
    );
    expect(screen.getByRole('region', { name: 'Bagian' })).toBeTruthy();
  });
});
