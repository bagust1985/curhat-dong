import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { err, ok, stubFetch } from '../test/fetch-stub';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const ME = {
  alias: 'senja tenang',
  avatar: null,
  bio: null,
  isListener: false,
  joinedAt: '2026-01-01T00:00:00Z',
  helpfulCount: 0,
  hasCompletedOnboarding: true,
  topics: [],
};

async function renderPage() {
  const mod = await import('../app/(app)/profile/page');
  const { SessionProvider } = await import('../lib/session');
  const Page = mod.default;
  render(
    <SessionProvider>
      <Page />
    </SessionProvider>,
  );
}

/**
 * `/profile` — the Akun tab's redirect page (Revisi, Aug 2026).
 *
 * The nav's Akun slot is a static `/profile` href; this page resolves the
 * alias. Before it existed, tapping Akun was a straight 404.
 */
describe('/profile redirect', () => {
  it('sends a signed-in user to their own profile, alias encoded', async () => {
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return ok(ME);
      return undefined;
    });
    await renderPage();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/profile/${encodeURIComponent('senja tenang')}`),
    );
  });

  it('sends an anonymous visitor to /auth', async () => {
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      return undefined;
    });
    await renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/auth'));
  });

  it('sends a half-registered user to /onboarding', async () => {
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND');
      return undefined;
    });
    await renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
  });

  it('shows a skeleton, not a redirect, while the session is still loading', async () => {
    // A refresh that never resolves keeps the session in 'loading'.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    await renderPage();
    expect(screen.getByRole('status').textContent).toContain('Lagi dimuat…');
    expect(replace).not.toHaveBeenCalled();
  });
});
