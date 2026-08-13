import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FEED_TABS, ListenerNudgeBanner, QUICK_LINKS } from './feed';
import { mergePages, toCardData, toIntent, toMood, type FeedApiItem } from '../lib/feed';
import { DAY_GREETING, MIDNIGHT_GREETING, feedGreeting, isMidnightHour } from '../lib/midnight';
import { relativeTime } from '../lib/relative-time';
import { err, ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function item(id: string, overrides: Partial<FeedApiItem> = {}): FeedApiItem {
  return {
    id,
    title: `Judul ${id}`,
    excerpt: 'isi singkat',
    mood: 'capek',
    intent: 'cuma_didengar',
    categorySlug: 'kerjaan',
    authorAlias: 'Anonim #1',
    isAnonymous: true,
    responseCount: 0,
    commentCount: 2,
    createdAt: new Date().toISOString(),
    needsListener: false,
    ...overrides,
  };
}

/**
 * Home feed — E15-T08. DESIGN-REF §2.4, PRD §6, §11.
 */
describe('midnight copy swap', () => {
  it('greets differently between 21:00 and 04:00', () => {
    expect(feedGreeting(new Date('2026-08-12T22:30:00'))).toBe(MIDNIGHT_GREETING);
    expect(feedGreeting(new Date('2026-08-12T02:00:00'))).toBe(MIDNIGHT_GREETING);
    expect(feedGreeting(new Date('2026-08-12T13:00:00'))).toBe(DAY_GREETING);
  });

  it('treats the boundaries the way the design states them', () => {
    expect(isMidnightHour(new Date('2026-08-12T20:59:00'))).toBe(false);
    expect(isMidnightHour(new Date('2026-08-12T21:00:00'))).toBe(true);
    expect(isMidnightHour(new Date('2026-08-12T03:59:00'))).toBe(true);
    expect(isMidnightHour(new Date('2026-08-12T04:00:00'))).toBe(false);
  });
});

describe('pagination', () => {
  it('drops items already on screen', () => {
    const merged = mergePages([item('a'), item('b')], [item('b'), item('c')]);
    expect(merged.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the order of what is already there', () => {
    const merged = mergePages([item('a')], [item('a')]);
    expect(merged).toHaveLength(1);
  });
});

describe('card mapping', () => {
  it('falls back rather than blanking when the server sends a mood it does not know', () => {
    // A vocabulary added server-side must not empty a card in an older client.
    expect(toMood('mood-yang-belum-ada')).toBe('kosong');
    expect(toIntent('niat-baru')).toBe('cuma_didengar');
    expect(toMood('capek')).toBe('capek');
  });

  it('marks a post needing a listener with the right card variant', () => {
    const card = toCardData(item('a', { needsListener: true }), {});
    expect(card.variant).toBe('butuh-didengar');
  });

  it('shows the category name when known, and the slug when not', () => {
    expect(toCardData(item('a'), { kerjaan: 'Kerjaan' }).categoryName).toBe('Kerjaan');
    expect(toCardData(item('a'), {}).categoryName).toBe('kerjaan');
  });
});

describe('relative time', () => {
  const now = new Date('2026-08-12T12:00:00Z');

  it('rounds to something a reader actually needs', () => {
    expect(relativeTime(new Date('2026-08-12T11:59:30Z'), now)).toBe('Baru aja');
    expect(relativeTime(new Date('2026-08-12T11:30:00Z'), now)).toBe('30 menit lalu');
    expect(relativeTime(new Date('2026-08-12T09:00:00Z'), now)).toBe('3 jam lalu');
    expect(relativeTime(new Date('2026-08-11T09:00:00Z'), now)).toBe('Kemarin');
  });

  it('does not print a negative time when the clocks disagree', () => {
    expect(relativeTime(new Date('2026-08-12T12:00:05Z'), now)).toBe('Baru aja');
  });
});

describe('listener nudge', () => {
  it('states a need without turning listening into a score', () => {
    render(<ListenerNudgeBanner waiting={12} onOpen={() => {}} onDismiss={() => {}} />);

    const text = document.body.textContent ?? '';
    expect(text).toContain('Ada orang yang sedang butuh didengar.');
    // No counts, no ranking, no "you helped N people" — PRD §11.
    expect(text).not.toMatch(/\b12\b|peringkat|leaderboard|poin|skor/i);
    expect(screen.getByRole('button', { name: 'Nanti aja' })).toBeTruthy();
  });

  it('renders nothing when nobody is waiting', () => {
    const { container } = render(
      <ListenerNudgeBanner waiting={0} onOpen={() => {}} onDismiss={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('the feed page (mocked API)', () => {
  const PROFILE = {
    alias: 'senja',
    avatar: null,
    bio: null,
    isListener: false,
    joinedAt: '2026-01-01T00:00:00Z',
    helpfulCount: 0,
    hasCompletedOnboarding: true,
    topics: [],
  };

  function stubFeed(pages: Record<string, { items: FeedApiItem[]; nextCursor: string | null }>) {
    return stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return ok(PROFILE);
      if (url.includes('/categories')) return ok([{ slug: 'kerjaan', name: 'Kerjaan' }]);
      if (url.includes('/v1/feed')) {
        const parsed = new URL(url);
        const key = `${parsed.searchParams.get('tab')}:${parsed.searchParams.get('cursor') ?? ''}`;
        return ok(pages[key] ?? { items: [], nextCursor: null });
      }
      return ok({});
    });
  }

  async function renderHome() {
    const { default: HomePage } = await import('../app/(app)/home/page');
    const { SessionProvider } = await import('../lib/session');
    render(
      <SessionProvider>
        <HomePage />
      </SessionProvider>,
    );
  }

  it('opens with the greeting, the start-curhat card and the feature shelf (Revisi 2)', async () => {
    stubFeed({ 'terbaru:': { items: [item('a')], nextCursor: null } });
    await renderHome();

    // Greeting carries the alias — this product has no real names to use.
    expect(await screen.findByRole('heading', { name: /hai, senja/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mulai curhat sekarang' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mulai Curhat' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fitur Utama' })).toBeTruthy();

    // ...and the feed is still on this screen, below the shelf.
    expect(screen.getByRole('tab', { name: 'Terbaru' })).toBeTruthy();
  });

  it('every feature tile goes somewhere that exists', async () => {
    // The mock's shelf lists Jurnal and Relaksasi, which are not features of
    // this product, and Komunitas, which is Phase 2 with no backend. A tile
    // that leads nowhere teaches people the buttons here are decorative.
    const routes = new Set([
      '/ai',
      '/listener/request',
      '/explore',
      '/search',
      '/home',
      '/notifications',
      '/curhat/baru',
      '/settings',
    ]);
    for (const link of QUICK_LINKS) {
      expect(routes.has(link.href), `${link.label} → ${link.href}`).toBe(true);
    }
    expect(QUICK_LINKS.map((link) => link.label)).not.toContain('Jurnal');
    expect(QUICK_LINKS.map((link) => link.label)).not.toContain('Relaksasi');
  });

  it('each feature tile is announced by words, not only a glyph', async () => {
    stubFeed({ 'terbaru:': { items: [], nextCursor: null } });
    await renderHome();

    await screen.findByRole('heading', { name: 'Fitur Utama' });
    for (const link of QUICK_LINKS) {
      const tile = screen.getByRole('button', { name: link.description });
      expect(tile, link.key).toBeTruthy();
      // The glyph is decoration; a reader must never land on it alone.
      expect(within(tile).getByText(link.glyph).getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('offers all four tabs and the AI entry, and no leaderboard anywhere', async () => {
    stubFeed({ 'terbaru:': { items: [item('a')], nextCursor: null } });
    await renderHome();

    await screen.findByRole('tab', { name: 'Terbaru' });
    for (const tab of FEED_TABS) {
      expect(screen.getByRole('tab', { name: tab.label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Ngobrol sama DONG AI' })).toBeTruthy();

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/pengikut|follower|leaderboard|peringkat|top 10/i);
  });

  it('shows the warm empty state for a tab with nothing in it', async () => {
    stubFeed({ 'terbaru:': { items: [], nextCursor: null } });
    await renderHome();

    expect(await screen.findByText('Belum ada yang cerita di sini.')).toBeTruthy();
  });

  it('does not load the same page twice when the loader fires in quick succession', async () => {
    const user = userEvent.setup();
    const spy = stubFeed({
      'terbaru:': { items: [item('a'), item('b')], nextCursor: 'c1' },
      'terbaru:c1': { items: [item('b'), item('c')], nextCursor: null },
    });
    await renderHome();

    const more = await screen.findByRole('button', { name: 'Muat lebih banyak' });
    // Two clicks before the first response settles — what a fast scroll does to
    // an infinite loader.
    await Promise.all([user.click(more), user.click(more)]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Judul c' })).toBeTruthy();
    });

    const feedCalls = requestsOf(spy).filter((entry) => entry === 'GET /v1/feed');
    // One first page + one next page. A third would mean the guard failed.
    expect(feedCalls.length).toBeLessThanOrEqual(2);

    // And `b` — present in both pages — appears once.
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getAllByRole('heading', { name: 'Judul b' })).toHaveLength(1);
  });

  it('keeps what is on screen and offers a retry when the network drops', async () => {
    let calls = 0;
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return ok(PROFILE);
      if (url.includes('/categories')) return ok([]);
      if (url.includes('/v1/feed')) {
        calls += 1;
        if (calls > 1) throw new TypeError('offline');
        return ok({ items: [item('a')], nextCursor: null });
      }
      return ok({});
    });
    await renderHome();

    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Judul a' });

    await user.click(screen.getByRole('button', { name: 'Muat ulang' }));

    expect(await screen.findByText('Koneksinya lagi putus-putus.')).toBeTruthy();
    // The curhat already read stays readable.
    expect(screen.getByRole('heading', { name: 'Judul a' })).toBeTruthy();
  });

  it('sends someone who is not signed in to the auth page', async () => {
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      return err(401, 'UNAUTHORIZED');
    });
    await renderHome();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth'));
  });
});
