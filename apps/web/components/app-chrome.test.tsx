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
    ['/ai', 'DONG AI'],
    ['/notifications', 'Notifikasi'],
    ['/profile/senja.tenang', 'Akun'],
    // Explore, search and listener own rail entries since E18-T02. On a phone
    // they are not in the bar and fall through to Beranda, which is where they
    // are reached from — honest either way.
    ['/explore', 'Jelajah'],
    ['/search', 'Cari'],
    ['/listener/request', 'Cari Listener'],
    ['/settings', 'Beranda'], // no owning destination — beranda stays the anchor
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

describe('one nav, two layouts (E18-T02)', () => {
  it('renders a single navigation landmark, not one per breakpoint', () => {
    // The desktop rail and the phone pill are the same element restyled. Two
    // navs would mean two landmarks and two tab orders through the same five
    // destinations — worst of all for the reader who most needs one answer to
    // "where am I".
    renderAt('/home');
    expect(screen.getAllByRole('navigation', { name: 'Navigasi utama' })).toHaveLength(1);
  });

  it('keeps one accessible name on the composer CTA across both shapes', () => {
    // It renders "+" on a phone and "+ Curhat" on desktop, but only one of the
    // two spans is ever visible and both are aria-hidden — the button's name
    // comes from aria-label and must not change with the viewport.
    renderAt('/home');
    expect(screen.getAllByRole('button', { name: 'Tulis curhat baru' })).toHaveLength(1);
  });

  it('offers exactly one control per destination', () => {
    renderAt('/home');
    for (const label of ['Beranda', 'DONG AI', 'Notifikasi', 'Akun', 'Jelajah', 'Cari']) {
      expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);
    }
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
