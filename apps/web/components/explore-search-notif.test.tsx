import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParams,
  useParams: () => ({}),
}));

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  searchParams = new URLSearchParams();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const PROFILE = {
  alias: 'aku',
  avatar: null,
  bio: null,
  isListener: false,
  joinedAt: '2026-01-01T00:00:00Z',
  helpfulCount: 0,
  hasCompletedOnboarding: true,
  topics: [],
};

function base(handler: (url: string, init: RequestInit) => ReturnType<typeof ok> | undefined) {
  return stubFetch((url, init) => {
    if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
    if (url.endsWith('/v1/me')) return ok(PROFILE);
    return handler(url, init) ?? ok({});
  });
}

async function renderPage(path: string) {
  const mod = await import(path);
  const { SessionProvider } = await import('../lib/session');
  const Page = mod.default as () => React.ReactElement;
  render(
    <SessionProvider>
      <Page />
    </SessionProvider>,
  );
}

/**
 * Explore, search and notifications — E15-T15.
 * DESIGN-REF §2.12–§2.14, CLAUDE.md non-negotiable #3.
 */
describe('explore', () => {
  it('shows each topic with how many curhat are active in it', async () => {
    base((url) =>
      url.includes('/v1/explore')
        ? ok([
            { slug: 'kerjaan', name: 'Kerjaan', icon: '💼', activePosts: 12 },
            { slug: 'sepi', name: 'Sepi', icon: '🌙', activePosts: 0 },
          ])
        : undefined,
    );
    await renderPage('../app/(app)/explore/page');

    expect(await screen.findByText('Kerjaan')).toBeTruthy();
    expect(screen.getByText('12 cerita aktif')).toBeTruthy();
    // Zero is stated warmly rather than as "0".
    expect(screen.getByText('Belum ada cerita')).toBeTruthy();
  });

  it('offers the warm empty state when nothing loads', async () => {
    base((url) => (url.includes('/v1/explore') ? ok([]) : undefined));
    await renderPage('../app/(app)/explore/page');

    expect(await screen.findByText('Belum ada yang cerita di sini.')).toBeTruthy();
  });
});

describe('search', () => {
  const RESULTS = {
    tab: 'curhat',
    query: 'capek',
    posts: [
      {
        id: 'p1',
        title: 'Capek kerja',
        excerpt: 'rasanya numpuk',
        mood: 'capek',
        intent: 'cuma_didengar',
        categorySlug: 'kerjaan',
        authorAlias: 'Anonim #1',
        isAnonymous: true,
        responseCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
        needsListener: false,
      },
    ],
    listeners: [],
    topics: [],
    nextCursor: null,
  };

  it('keeps recent searches on the device and never sends them', async () => {
    const user = userEvent.setup();
    const spy = base((url) => (url.includes('/v1/search') ? ok(RESULTS) : undefined));
    await renderPage('../app/(app)/search/page');

    await user.type(await screen.findByLabelText('Kata kunci'), 'capek{Enter}');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Capek kerja' })).toBeTruthy());

    // Stored locally…
    expect(localStorage.getItem('curhat.recent_searches')).toContain('capek');

    // …and nothing about the search left the device. The session refresh is the
    // only POST on this page; a search history endpoint does not exist, and
    // this page must not be the first thing to invent one.
    const posts = requestsOf(spy)
      .filter((entry) => entry.startsWith('POST'))
      .filter((entry) => !entry.includes('/auth/'));
    expect(posts).toEqual([]);
  });

  it('lets a recent search be removed', async () => {
    const user = userEvent.setup();
    localStorage.setItem('curhat.recent_searches', JSON.stringify(['sepi banget']));
    base(() => undefined);
    await renderPage('../app/(app)/search/page');

    await user.click(await screen.findByRole('button', { name: 'Hapus "sepi banget" dari riwayat' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'sepi banget' })).toBeNull(),
    );
  });

  it('shows the warm empty state, not "0 results"', async () => {
    const user = userEvent.setup();
    base((url) =>
      url.includes('/v1/search') ? ok({ ...RESULTS, posts: [] }) : undefined,
    );
    await renderPage('../app/(app)/search/page');

    await user.type(await screen.findByLabelText('Kata kunci'), 'xyz{Enter}');

    expect(await screen.findByText('Nggak ketemu.')).toBeTruthy();
  });

  it('offers all three result tabs', async () => {
    base(() => undefined);
    await renderPage('../app/(app)/search/page');

    for (const label of ['Curhat', 'Listener', 'Topik']) {
      expect(await screen.findByRole('tab', { name: label })).toBeTruthy();
    }
  });
});

describe('notifications', () => {
  const ROWS = [
    {
      id: 'n1',
      type: 'response',
      template: 'response.comment',
      title: 'Ada yang membalas curhatmu',
      body: 'Ada seseorang yang membalas curhatmu.',
      targetId: 'p1',
      deepLink: '/post/p1',
      targetAvailable: true,
      readAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'n2',
      type: 'social',
      template: 'social.listening',
      title: 'Ada yang lagi dengerin ceritamu',
      body: 'Ada yang lagi baca ceritamu.',
      targetId: 'p2',
      deepLink: '/post/p2',
      targetAvailable: false,
      unavailableMessage: 'Curhatnya udah nggak ada.',
      readAt: '2026-08-01T00:00:00Z',
      createdAt: new Date().toISOString(),
    },
  ];

  it('renders only the generic template text, never curhat content', async () => {
    base((url) => (url.includes('/v1/notifications') ? ok({ items: ROWS }) : undefined));
    await renderPage('../app/(app)/notifications/page');

    await screen.findByText('Ada yang membalas curhatmu');

    // The page renders what the API sent and fetches nothing else. An "enrich
    // the row with a preview" change would show up here as an extra request.
    const spy = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const targets = requestsOf(spy).filter((entry) => entry.includes('/v1/posts/'));
    expect(targets).toEqual([]);
  });

  it('does not follow a deep link whose target is gone', async () => {
    const user = userEvent.setup();
    base((url) => (url.includes('/v1/notifications') ? ok({ items: ROWS }) : undefined));
    await renderPage('../app/(app)/notifications/page');

    await user.click(await screen.findByText('Ada yang lagi dengerin ceritamu'));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('Curhatnya udah nggak ada.')).toBeTruthy();
  });

  it('follows a live deep link and marks the row read', async () => {
    const user = userEvent.setup();
    const spy = base((url) => (url.includes('/v1/notifications') ? ok({ items: ROWS }) : undefined));
    await renderPage('../app/(app)/notifications/page');

    await user.click(await screen.findByText('Ada yang membalas curhatmu'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/post/p1'));
    expect(requestsOf(spy)).toContain('POST /v1/notifications/read');
  });

  it('marks unread state with more than colour', async () => {
    base((url) => (url.includes('/v1/notifications') ? ok({ items: ROWS }) : undefined));
    await renderPage('../app/(app)/notifications/page');

    const unread = await screen.findByRole('button', { name: /belum dibaca/i });
    expect(unread).toBeTruthy();
  });
});
