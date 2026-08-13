import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button, Card, buttonClasses } from './ui';

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

  it('puts white text only on primary — never on brand or pink', () => {
    // The contrast rule as a class-level assertion: primary-fg (white in
    // light theme) may only pair with --color-primary. A variant painting
    // --color-brand or pink behind primary-fg would fail AA (lib/tokens.ts).
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      const classes = buttonClasses(variant);
      if (classes.includes('text-[var(--color-primary-fg)]')) {
        expect(classes).toContain('bg-[var(--color-primary)]');
        expect(classes).not.toContain('var(--color-brand)');
        expect(classes).not.toContain('var(--color-accent-pink)');
      }
    }
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
