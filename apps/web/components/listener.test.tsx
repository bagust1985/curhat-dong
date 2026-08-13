import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GuidelinesGate,
  ListenerStatsPanel,
  MatchOfferModal,
  RestStateBanner,
  type BurnoutState,
} from './listener';
import { err, ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const SECTIONS = [
  { title: 'Kamu bukan konselor', body: 'Jangan mendiagnosis.' },
  { title: 'Kamu boleh berhenti', body: 'Berhenti bukan kegagalan.' },
];

const RESTING: BurnoutState = {
  activeSessions: 0,
  maxConcurrent: 2,
  sessionsToday: 5,
  maxSessionsPerDay: 5,
  cooldownUntil: null,
  dailyCapReached: true,
  restReminder: false,
  message: 'Kamu udah nemenin lima orang hari ini. Itu banyak banget.',
};

/**
 * Listener — E15-T13. DESIGN-REF §2.9, §2.20, PRD §11, §12.
 */
describe('guidelines gate', () => {
  function renderGate() {
    const onAccept = vi.fn();
    render(
      <GuidelinesGate
        version="2026-08-12"
        sections={SECTIONS}
        onAccept={onAccept}
        pending={false}
      />,
    );
    return onAccept;
  }

  /**
   * jsdom reports every layout as 0, which reads as "already at the bottom".
   * The heights are stubbed on the prototype *before* render because the
   * component measures on mount — patching the node afterwards would test a
   * different component than the one that ran.
   */
  function withHeights(scrollHeight: number, clientHeight: number) {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
  }

  it('keeps accept off until the text has been scrolled to the end', async () => {
    withHeights(800, 300);
    renderGate();

    const region = screen.getByRole('region', { name: 'Panduan listener' });
    const accept = screen.getByRole('button', {
      name: 'Aku ngerti dan siap dengerin',
    }) as HTMLButtonElement;

    expect(accept.disabled).toBe(true);

    region.scrollTop = 500;
    fireEvent.scroll(region);

    await waitFor(() => expect(accept.disabled).toBe(false));
  });

  it('does not lock out a reader whose screen shows everything at once', () => {
    // Nothing to scroll — a tall desktop window. Locking that reader out would
    // be a bug they cannot work around.
    withHeights(200, 400);
    renderGate();

    expect(
      (screen.getByRole('button', { name: 'Aku ngerti dan siap dengerin' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('sends the version that was actually displayed', async () => {
    const user = userEvent.setup();
    const onAccept = renderGate();

    await user.click(screen.getByRole('button', { name: 'Aku ngerti dan siap dengerin' }));
    // Acceptance is recorded against a version; sending a hardcoded one would
    // make "they accepted the current guidelines" untrue after an edit.
    expect(onAccept).toHaveBeenCalledWith('2026-08-12');
  });
});

describe('match offer', () => {
  const offer = {
    matchId: 'm-1',
    topic: 'Kerjaan',
    emotion: 'capek',
    mood: 'capek',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  it('shows the need and nothing that identifies anyone', () => {
    render(<MatchOfferModal offer={offer} onAccept={() => {}} onDecline={() => {}} />);

    expect(screen.getByText('Kerjaan')).toBeTruthy();
    const text = document.body.textContent ?? '';
    // No alias, no age, no history — the listener decides on the need.
    expect(text).not.toMatch(/@|alias|umur|tahun|riwayat/i);
  });

  it('counts down and declines itself when the offer expires', async () => {
    vi.useFakeTimers();
    const onDecline = vi.fn();
    let now = Date.now();
    render(
      <MatchOfferModal
        offer={{ ...offer, expiresAt: new Date(now + 3000).toISOString() }}
        onAccept={() => {}}
        onDecline={onDecline}
        now={() => now}
      />,
    );

    expect(screen.getByRole('timer').textContent).toContain('3 detik');

    now += 3000;
    await vi.advanceTimersByTimeAsync(3000);

    expect(onDecline).toHaveBeenCalledWith('m-1');
  });

  it('makes declining as easy as accepting', () => {
    render(<MatchOfferModal offer={offer} onAccept={() => {}} onDecline={() => {}} />);
    // Both full-size buttons. A decline hidden in a corner is pressure.
    expect(screen.getByRole('button', { name: 'Lagi nggak bisa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aku siap dengerin' })).toBeTruthy();
  });
});

describe('rest states', () => {
  it('is appreciative and offers no way to push through', () => {
    render(<RestStateBanner state={RESTING} />);

    expect(screen.getByText('Hari ini kamu udah cukup 🤍')).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/peringatan|melebihi batas|kamu terlalu|harus berhenti/i);
    // No override. A cap with a "continue anyway" is decoration, and the person
    // most likely to press it is the one who should not.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing when the listener is free to take a session', () => {
    const { container } = render(
      <RestStateBanner
        state={{ ...RESTING, dailyCapReached: false, restReminder: false, message: null }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('stats', () => {
  it('shows the listener their own numbers with no comparison', () => {
    render(
      <ListenerStatsPanel
        stats={{ sessionCount: 12, feltHeardScore: 0.75, helpfulScore: 0.9, recentSessions: [] }}
      />,
    );

    expect(screen.getByText('75%')).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/peringkat|leaderboard|top|dibanding listener lain|persentil/i);
    expect(text).toMatch(/nggak dibandingin sama siapa pun/i);
  });

  it('shows a dash rather than 0% before anyone has answered', () => {
    render(
      <ListenerStatsPanel
        stats={{ sessionCount: 0, feltHeardScore: 0, helpfulScore: 0, recentSessions: [] }}
      />,
    );
    // "0%" would read as "nobody felt heard by you" on day one.
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('the listen page (mocked API)', () => {
  const PROFILE = {
    topics: [],
    languages: ['id'],
    maxConcurrent: 2,
    isAvailable: true,
    safetyStatus: 'ok',
    guidelinesVersionAccepted: '2026-08-12',
    needsGuidelinesAcceptance: false,
  };

  function stubListen(options: { profile?: unknown; offers?: unknown[] } = {}) {
    return stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) {
        return ok({
          alias: 'aku',
          avatar: null,
          bio: null,
          isListener: true,
          joinedAt: '2026-01-01T00:00:00Z',
          helpfulCount: 0,
          hasCompletedOnboarding: true,
          topics: [],
        });
      }
      if (url.includes('/listener/guidelines')) {
        return ok({ version: '2026-08-12', sections: SECTIONS });
      }
      if (url.includes('/listener/profile')) {
        return options.profile === null ? err(404, 'NOT_FOUND') : ok(options.profile ?? PROFILE);
      }
      if (url.includes('/listener/stats')) {
        return ok({
          sessionCount: 3,
          feltHeardScore: 0.5,
          helpfulScore: 0.6,
          recentSessions: [],
          burnout: { ...RESTING, dailyCapReached: false, restReminder: false, message: null },
        });
      }
      if (url.includes('/listener/offers')) return ok(options.offers ?? []);
      if (url.includes('/matches/')) return ok({ sessionId: 's1', roomId: 'r1' });
      return ok({});
    });
  }

  async function renderListen() {
    const { default: ListenPage } = await import('../app/(app)/listen/page');
    const { SessionProvider } = await import('../lib/session');
    render(
      <SessionProvider>
        <ListenPage />
      </SessionProvider>,
    );
  }

  it('lands someone who is not a listener yet on the guidelines', async () => {
    stubListen({ profile: null });
    await renderListen();

    expect(await screen.findByRole('heading', { name: 'Sebelum jadi listener' })).toBeTruthy();
  });

  it('asks an existing listener to re-read after the guidelines change', async () => {
    stubListen({ profile: { ...PROFILE, needsGuidelinesAcceptance: true } });
    await renderListen();

    expect(await screen.findByRole('heading', { name: 'Sebelum jadi listener' })).toBeTruthy();
  });

  it('takes an accepted offer into the room', async () => {
    const user = userEvent.setup();
    const spy = stubListen({
      offers: [
        {
          matchId: 'm-9',
          topic: 'Hubungan',
          emotion: 'sedih',
          mood: 'sedih',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });
    await renderListen();

    await user.click(await screen.findByRole('button', { name: 'Aku siap dengerin' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/room/r1'));
    expect(requestsOf(spy)).toContain('POST /v1/listener/matches/m-9/accept');
  });

  it('says something kind when the offer was already taken', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return ok({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) {
        return ok({
          alias: 'aku',
          avatar: null,
          bio: null,
          isListener: true,
          joinedAt: '2026-01-01T00:00:00Z',
          helpfulCount: 0,
          hasCompletedOnboarding: true,
          topics: [],
        });
      }
      if (url.includes('/listener/guidelines')) return ok({ version: 'v', sections: SECTIONS });
      if (url.includes('/listener/profile')) return ok(PROFILE);
      if (url.includes('/listener/stats')) {
        return ok({
          sessionCount: 0,
          feltHeardScore: 0,
          helpfulScore: 0,
          recentSessions: [],
          burnout: { ...RESTING, dailyCapReached: false, message: null },
        });
      }
      if (url.includes('/listener/offers')) {
        return ok([
          {
            matchId: 'm-9',
            topic: 'Hubungan',
            emotion: 'sedih',
            mood: null,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ]);
      }
      if (url.includes('/accept')) return err(409, 'MATCH_OFFER_ALREADY_TAKEN');
      return ok({});
    });
    await renderListen();

    await user.click(await screen.findByRole('button', { name: 'Aku siap dengerin' }));

    expect(await screen.findByText(/udah ada yang duluan nemenin/i)).toBeTruthy();
  });
});
