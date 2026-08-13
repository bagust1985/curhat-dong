import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LandingPage, { metadata } from '../app/page';
import robots from '../app/robots';
import { HONESTY_NOTES, INDEXABLE_ROUTES, LEGAL_LINKS, PREVIEW_CURHAT } from '../lib/landing';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/**
 * Landing page — E15-T05. DESIGN-REF §2.1, PRD §13.
 *
 * The acceptance criteria here are not visual, so neither are the tests: the
 * page must not touch the real feed, and it must be the only thing in the
 * product that a crawler is allowed to see.
 */
describe('preview feed is curated, never real curhat', () => {
  it('makes no network request while rendering', async () => {
    // The point of the assertion: a preview built from the live feed would be
    // an easy, plausible change to make later — and would put a stranger's
    // curhat on a public, indexable, unauthenticated page.
    const fetchSpy = vi.fn(() => Promise.reject(new Error('landing page must not fetch')));
    vi.stubGlobal('fetch', fetchSpy);

    render(<LandingPage />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /kira-kira begini isinya/i })).toBeTruthy();
  });

  it('says in visible copy that the examples are not real', () => {
    render(<LandingPage />);

    expect(screen.getByText(/bukan curhat asli dari siapa pun/i)).toBeTruthy();
  });

  it('renders every preview card without an action that implies a real post', () => {
    render(<LandingPage />);

    const section = screen.getByRole('region', { name: /kira-kira begini isinya/i });

    for (const item of PREVIEW_CURHAT) {
      expect(within(section).getByRole('heading', { name: item.title }), item.id).toBeTruthy();
    }
    // `CurhatCard` renders its "Baca" button only when given `onOpen`. There is
    // nothing to open, so there must be no button offering to open it.
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    expect(within(section).queryAllByRole('link')).toHaveLength(0);
  });

  it('keeps the preview ids out of post-shaped links', () => {
    render(<LandingPage />);

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '');

    expect(hrefs.some((href) => href.includes('/post/'))).toBe(false);
  });
});

describe('indexing (PRD §13, CLAUDE.md non-negotiable #5)', () => {
  it('opts the landing page back into indexing', () => {
    // The root layout sets index: false for the whole app; this page-level
    // metadata is the single deliberate exception.
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('puts no curhat content in the metadata', () => {
    const text = JSON.stringify(metadata).toLowerCase();

    // The description is fixed marketing copy. If it ever became "latest posts
    // from the feed", link previews and crawler caches would carry the content
    // out of the product entirely.
    for (const excerpt of PREVIEW_CURHAT.map((item) => item.excerpt)) {
      expect(text).not.toContain(excerpt.slice(0, 30).toLowerCase());
    }
  });

  it('allows only the landing page in robots.txt', () => {
    const [rule] = [robots().rules].flat();

    expect(rule?.disallow).toBe('/');
    // "/$" and not "/" — the anchor is the whole difference between allowing
    // the landing page and allowing the entire app.
    expect(rule?.allow).toEqual(['/$']);
    expect(INDEXABLE_ROUTES).toEqual(['/']);
  });
});

describe('landing content (DESIGN-REF §2.1)', () => {
  it('leads with the mock headline', () => {
    render(<LandingPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Ada tempat buat cerita');
  });

  it('offers the signup CTA', () => {
    render(<LandingPage />);

    expect(screen.getByRole('link', { name: 'Mulai Curhat' }).getAttribute('href')).toBe('/auth');
  });

  it('links the APK when a build exists, and says so plainly when it does not', () => {
    render(<LandingPage />);
    // Nothing configured in test env: a dead download button would be worse
    // than an honest sentence.
    expect(screen.queryByRole('link', { name: /download apk/i })).toBeNull();
    expect(screen.getByText(/aplikasi android lagi disiapkan/i)).toBeTruthy();
  });

  it('states the 18+ limit and that this is not an emergency service', () => {
    render(<LandingPage />);

    expect(HONESTY_NOTES).toHaveLength(2);
    expect(screen.getByText(/18 tahun ke atas/i)).toBeTruthy();
    expect(screen.getByText(/bukan layanan darurat/i)).toBeTruthy();
  });

  it('claims no hotline numbers it cannot stand behind', () => {
    render(<LandingPage />);

    // E17-T12 is still open: no verified Indonesian hotline list exists yet, and
    // a wrong number on the public page of a mental-health product is worse than
    // no number. Guard against one being pasted in casually.
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\b(?:\+62|0\d{2,3})[\s.-]?\d{3,}/);
    expect(body).not.toMatch(/\b1(?:19|500\d{3})\b/);
  });

  it('links all four footer destinations', () => {
    render(<LandingPage />);

    const nav = screen.getByRole('navigation', { name: 'Tautan legal' });
    for (const link of LEGAL_LINKS) {
      expect(
        within(nav).getByRole('link', { name: link.label }).getAttribute('href'),
        link.href,
      ).toBe(link.href);
    }
  });
});
