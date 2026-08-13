import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppChrome } from './app-chrome';

const push = vi.fn();
let currentPath = '/home';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

let sessionStatus = 'authenticated';
vi.mock('../lib/session', () => ({
  useSession: () => ({ status: sessionStatus, user: null }),
}));

afterEach(() => {
  document.body.innerHTML = '';
  currentPath = '/home';
  sessionStatus = 'authenticated';
  vi.clearAllMocks();
});

function renderAt(path: string, status = 'authenticated') {
  currentPath = path;
  sessionStatus = status;
  render(
    <AppChrome>
      <p>isi halaman</p>
    </AppChrome>,
  );
}

/**
 * App shell — Revisi 2. The tab bar exists on every app screen now, except
 * the ones that need the screen to themselves.
 */
describe('where the bar shows', () => {
  it.each([
    ['/home', 'Beranda'],
    ['/ai', 'Chat'],
    ['/notifications', 'Notifikasi'],
    ['/profile/senja.tenang', 'Akun'],
    ['/explore', 'Beranda'], // no owning tab — beranda stays the anchor
    ['/settings', 'Beranda'],
  ])('shows the nav on %s with %s active', (path, activeLabel) => {
    renderAt(path);

    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    expect(nav).toBeTruthy();
    const active = screen.getByRole('button', { name: activeLabel });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it.each(['/auth', '/onboarding', '/room/abc123', '/moderation/actions'])(
    'keeps the nav off %s',
    (path) => {
      renderAt(path);
      expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).toBeNull();
      expect(screen.getByText('isi halaman')).toBeTruthy();
    },
  );

  it('keeps the nav away from anonymous visitors', () => {
    renderAt('/home', 'anonymous');
    expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).toBeNull();
  });
});

describe('what the bar does', () => {
  it('navigates on tab press and opens the composer from the FAB', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderAt('/home');

    await user.click(screen.getByRole('button', { name: 'Notifikasi' }));
    expect(push).toHaveBeenCalledWith('/notifications');

    await user.click(screen.getByRole('button', { name: 'Tulis curhat baru' }));
    expect(push).toHaveBeenCalledWith('/curhat/baru');
  });
});
