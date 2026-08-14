import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bodyOf, err, ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
let routeParams: Record<string, string> = {};
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => routeParams,
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  routeParams = {};
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const ME = {
  alias: 'aku',
  avatar: null,
  bio: 'lagi belajar istirahat',
  isListener: false,
  joinedAt: '2026-01-01T00:00:00Z',
  helpfulCount: 4,
  hasCompletedOnboarding: true,
  topics: [],
};

function base(handler: (url: string, init: RequestInit) => ReturnType<typeof ok> | undefined) {
  return stubFetch((url, init) => {
    if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
    if (url.endsWith('/v1/me')) return ok(ME);
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
 * Profile, settings, data and appeals — E15-T16.
 * DESIGN-REF §2.15, §2.16, §2.19, PRD §16, §25.
 */
describe('public profile', () => {
  it('shows nothing that identifies the person behind the alias', async () => {
    routeParams = { alias: 'senja.tenang' };
    base((url) =>
      url.includes('/v1/users/senja.tenang')
        ? ok({
            alias: 'senja.tenang',
            avatar: null,
            bio: 'suka ngopi',
            isListener: true,
            joinedAt: '2026-02-01T00:00:00Z',
            helpfulCount: 9,
          })
        : undefined,
    );
    await renderPage('../app/(app)/profile/[alias]/page');

    await screen.findByRole('heading', { name: 'senja.tenang' });
    const text = document.body.textContent ?? '';

    // No email, no phone, and no follower count — PRD §16 rules the last one
    // out, so its absence is a decision rather than an oversight.
    expect(text).not.toMatch(/@\w+\.\w+|\+62|pengikut|follower|mengikuti/i);
    expect(screen.getByText('Listener')).toBeTruthy();
  });

  it('offers report and block on someone else, and settings on your own', async () => {
    routeParams = { alias: 'aku' };
    base((url) => (url.includes('/v1/users/aku') ? ok(ME) : undefined));
    await renderPage('../app/(app)/profile/[alias]/page');

    await screen.findByRole('heading', { name: 'aku' });
    expect(screen.getByRole('button', { name: 'Atur profil & akun' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Blokir' })).toBeNull();
  });
});

describe('settings', () => {
  it('sends only the toggle that changed', async () => {
    const user = userEvent.setup();
    const spy = base((url) =>
      url.includes('/notification-settings')
        ? ok({
            perTypeToggles: {
              social: { push: true, inApp: true },
              response: { push: true, inApp: true },
            },
            quietHoursEnabled: true,
          })
        : undefined,
    );
    await renderPage('../app/(app)/settings/page');

    const socialPush = (await screen.findAllByRole('checkbox'))[0]!;
    await user.click(socialPush);

    await waitFor(() =>
      expect(requestsOf(spy)).toContain('PATCH /v1/me/notification-settings'),
    );
    const body = bodyOf(spy, 'PATCH /v1/me/notification-settings') as {
      perTypeToggles: Record<string, unknown>;
    };
    // Sending the whole set back is how a stale screen reverts a setting
    // somebody changed on another device.
    expect(Object.keys(body.perTypeToggles)).toEqual(['social']);
  });

  it('does not let safety notifications be switched off', async () => {
    base((url) =>
      url.includes('/notification-settings')
        ? ok({ perTypeToggles: {}, quietHoursEnabled: false })
        : undefined,
    );
    await renderPage('../app/(app)/settings/page');

    // Two locked categories — safety and account — each saying why.
    expect(await screen.findAllByText(/selalu aktif/i)).toHaveLength(2);
    // Six categories; only the four optional ones get push + in-app toggles.
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });

  it('previews the themes it is actually offering (E18-T01)', async () => {
    base((url) =>
      url.includes('/notification-settings')
        ? ok({ perTypeToggles: {}, quietHoursEnabled: false })
        : undefined,
    );
    const { THEMES } = await import('../lib/tokens');
    await renderPage('../app/(app)/settings/page');

    const options = await screen.findAllByRole('radio');
    expect(options).toHaveLength(3);

    // The DOM normalises an inline hex to rgb(), so compare in that form.
    const rgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

    // The swatches are painted from lib/tokens.ts, so a preview can never show
    // a palette the app does not have. Asserting the real values is what keeps
    // that true if somebody hard-codes a "close enough" colour later.
    const system = options[0]!;
    expect(system.innerHTML).toContain(rgb(THEMES.light.bg));
    // "Ikut sistem" is the only option that changes on its own, and the copy
    // promises Midnight Mode — so the preview has to show it.
    expect(system.innerHTML).toContain(rgb(THEMES.midnight.bg));
    expect(options[2]!.innerHTML).toContain(rgb(THEMES.dark.primary));
  });
});

describe('data and privacy', () => {
  function stubData(consequences: string[] = ['Curhatmu dihapus.']) {
    return base((url) => {
      if (url.includes('/me/consents')) {
        return ok({
          consents: [
            { consentType: 'tos_privacy', granted: true, grantedAt: '2026-01-01T00:00:00Z' },
            { consentType: 'analytics', granted: true, grantedAt: '2026-01-01T00:00:00Z' },
          ],
        });
      }
      if (url.includes('/me/deletion-consequences')) return ok({ mode: 'purge', consequences });
      return undefined;
    });
  }

  it('lets analytics be turned off and says nothing breaks', async () => {
    const user = userEvent.setup();
    const spy = stubData();
    await renderPage('../app/(app)/settings/data/page');

    const box = await screen.findByRole('checkbox');
    await user.click(box);

    await waitFor(() => expect(requestsOf(spy)).toContain('POST /v1/me/consents'));
    // The confirmation says it too, not only the checkbox description.
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Udah dimatiin. Semua fitur tetap jalan.',
    );
  });

  it('states that anonymise cannot be undone before the confirm step', async () => {
    const user = userEvent.setup();
    stubData();
    await renderPage('../app/(app)/settings/data/page');

    await user.click(
      await screen.findByRole('radio', { name: /tinggalin tulisanku tanpa nama/i }),
    );

    // Before any confirmation dialog exists.
    expect(screen.getByText(/nggak bisa dibatalin/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the server-written consequences and demands the typed phrase', async () => {
    const user = userEvent.setup();
    stubData([
      'Pesan yang udah kamu kirim di ruang orang lain nggak ikut terhapus.',
      'Salinan cadangan baru hilang dalam 30 hari.',
    ]);
    await renderPage('../app/(app)/settings/data/page');

    await user.click(await screen.findByRole('button', { name: 'Lanjut hapus akun' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/ruang orang lain nggak ikut terhapus/);
    expect(dialog.textContent).toMatch(/30 hari/);

    const confirm = screen.getByRole('button', { name: 'Hapus akunku' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});

describe('moderation actions and appeals', () => {
  const BASE_ACTION = {
    actionId: 'a1',
    action: 'remove',
    reason: 'Konten melanggar aturan komunitas.',
    durationHours: null,
    createdAt: new Date().toISOString(),
    appealable: true,
    appealDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    appeal: null as { id: string; status: string; decidedAt: string | null } | null,
  };

  function stubActions(overrides: Partial<typeof BASE_ACTION> = {}) {
    return base((url) =>
      url.includes('/me/moderation-actions') ? ok([{ ...BASE_ACTION, ...overrides }]) : undefined,
    );
  }

  it('never names the moderator', async () => {
    stubActions();
    await renderPage('../app/(app)/moderation/actions/page');

    await screen.findByRole('heading', { name: 'Konten dihapus' });
    // Naming them would invite retaliation against a volunteer.
    expect(document.body.textContent).not.toMatch(/moderator [A-Z@]|oleh admin|ditangani oleh/i);
  });

  it('says who will review the appeal', async () => {
    const user = userEvent.setup();
    stubActions();
    await renderPage('../app/(app)/moderation/actions/page');

    await user.click(await screen.findByRole('button', { name: 'Ajukan banding' }));
    expect(
      screen.getByText(/bukan orang yang ngambil keputusan ini/i),
    ).toBeTruthy();
  });

  it('refuses an appeal too short to weigh, before sending it', async () => {
    const user = userEvent.setup();
    const spy = stubActions();
    await renderPage('../app/(app)/moderation/actions/page');

    await user.click(await screen.findByRole('button', { name: 'Ajukan banding' }));
    await user.type(screen.getByLabelText('Ceritain dari sisi kamu'), 'nggak setuju');
    await user.click(screen.getByRole('button', { name: 'Kirim banding' }));

    expect(screen.getByRole('alert').textContent).toMatch(/minimal 20 huruf/i);
    expect(requestsOf(spy)).not.toContain('POST /v1/appeals');
  });

  it('shows the pending state after an appeal was submitted', async () => {
    stubActions({
      appealable: false,
      appeal: { id: 'ap1', status: 'pending', decidedAt: null },
    });
    await renderPage('../app/(app)/moderation/actions/page');

    expect(await screen.findByText(/lagi ditinjau orang lain/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajukan banding' })).toBeNull();
  });

  it('says plainly when the window has closed', async () => {
    stubActions({ appealable: false, appeal: null });
    await renderPage('../app/(app)/moderation/actions/page');

    expect(await screen.findByText(/waktu buat banding yang ini udah lewat/i)).toBeTruthy();
  });

  it('reports a decided appeal in the result state', async () => {
    stubActions({
      appealable: false,
      appeal: { id: 'ap1', status: 'overturned', decidedAt: new Date().toISOString() },
    });
    await renderPage('../app/(app)/moderation/actions/page');

    expect(await screen.findByText(/keputusannya dibatalkan/i)).toBeTruthy();
  });

  it('surfaces a window-expired refusal from the server', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) return ok(ME);
      if (url.includes('/me/moderation-actions')) return ok([BASE_ACTION]);
      if (url.endsWith('/v1/appeals')) return err(403, 'APPEAL_WINDOW_EXPIRED');
      return ok({});
    });
    await renderPage('../app/(app)/moderation/actions/page');

    await user.click(await screen.findByRole('button', { name: 'Ajukan banding' }));
    await user.type(
      screen.getByLabelText('Ceritain dari sisi kamu'),
      'aku ngerasa ini salah paham dan mau jelasin duduk perkaranya',
    );
    await user.click(screen.getByRole('button', { name: 'Kirim banding' }));

    expect(await screen.findByText('Waktu buat banding udah lewat.')).toBeTruthy();
  });
});
