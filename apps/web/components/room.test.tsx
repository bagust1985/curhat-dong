import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MatchFailedState,
  RoomHeader,
  SearchingState,
  SessionFeedback,
  ThankYouState,
} from './room';
import { ok, requestsOf, stubFetch } from '../test/fetch-stub';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ id: 'room-1' }),
  useSearchParams: () => new URLSearchParams('topic=kerjaan&emotion=capek'),
}));

/** A socket stub — the room subscribes on mount, so this must always exist. */
const socketHandlers = new Map<string, (payload: unknown) => void>();
const emit = vi.fn();
vi.mock('socket.io-client', () => ({
  io: () => ({
    emit,
    on: (event: string, handler: (payload: unknown) => void) => {
      socketHandlers.set(event, handler);
    },
    off: (event: string) => socketHandlers.delete(event),
    close: vi.fn(),
    connect: vi.fn(),
    auth: {},
  }),
}));

afterEach(() => {
  document.body.innerHTML = '';
  socketHandlers.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Listener request, room and session feedback — E15-T14.
 * DESIGN-REF §2.10, §2.11, PRD §11.
 */
describe('searching state', () => {
  it('is calm and promises nothing', () => {
    render(<SearchingState estimateLabel="Biasanya beberapa menit." onCancel={() => {}} />);

    expect(
      screen.getByRole('heading', {
        name: 'Lagi nyariin orang yang tepat buat dengerin kamu…',
      }),
    ).toBeTruthy();

    const text = document.body.textContent ?? '';
    // No promise that somebody will be found. There may be nobody awake, and a
    // promise that fails makes the failure land harder.
    expect(text).not.toMatch(/pasti|dijamin|segera ketemu|tunggu sebentar lagi ya pasti/i);
  });
});

describe('failed match', () => {
  it('offers three real alternatives and blames nobody', async () => {
    const user = userEvent.setup();
    const toAi = vi.fn();
    render(
      <MatchFailedState
        alternatives={[
          { label: 'Ngobrol sama DONG AI dulu', onSelect: toAi },
          { label: 'Tulis di Butuh Didengar', onSelect: () => {} },
          { label: 'Coba cari lagi', onSelect: () => {} },
        ]}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText(/bukan karena ceritamu nggak penting/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Ngobrol sama DONG AI dulu' }));
    expect(toAi).toHaveBeenCalledOnce();
  });
});

describe('room header', () => {
  it('keeps Escalate visible rather than in a menu', () => {
    render(
      <RoomHeader
        counterpartAlias="senja"
        role="listener"
        online
        canEscalate
        onReport={() => {}}
        onBlock={() => {}}
        onEnd={() => {}}
        onEscalate={() => {}}
      />,
    );

    // Present as a top-level button, with no disclosure control hiding it.
    expect(screen.getByRole('button', { name: 'Escalate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /⋯|menu|lainnya/i })).toBeNull();
  });

  it('does not offer Escalate to the requester', () => {
    render(
      <RoomHeader
        counterpartAlias="senja"
        role="requester"
        online={false}
        canEscalate={false}
        onReport={() => {}}
        onBlock={() => {}}
        onEnd={() => {}}
        onEscalate={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Escalate' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Akhiri sesi' })).toBeTruthy();
  });
});

describe('session feedback', () => {
  it('asks the requester whether they felt heard', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SessionFeedback role="requester" onSubmit={onSubmit} />);

    expect(screen.getByRole('heading', { name: 'Kamu merasa didengar?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Iya' }));
    expect(onSubmit).toHaveBeenCalledWith({ feltHeard: 'yes' });
  });

  it('asks the listener a safety question, not a rating', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SessionFeedback role="listener" onSubmit={onSubmit} />);

    expect(screen.getByRole('heading', { name: 'Percakapan berjalan aman?' })).toBeTruthy();
    // No stars, no score for the person they just talked to.
    expect(document.body.textContent).not.toMatch(/bintang|nilai|rating|skor/i);

    await user.click(screen.getByRole('button', { name: 'Nggak' }));
    await user.type(screen.getByLabelText(/apa yang terjadi/i), 'dia minta nomor aku');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));

    expect(onSubmit).toHaveBeenCalledWith({ feltSafe: false, note: 'dia minta nomor aku' });
  });

  it('thanks the listener in their own words', () => {
    render(<ThankYouState role="listener" onHome={() => {}} />);
    expect(screen.getByText('Makasih udah mau dengerin 🤍')).toBeTruthy();
  });
});

describe('the room page (mocked API and socket)', () => {
  const ROOM = {
    roomId: 'room-1',
    role: 'listener' as const,
    status: 'open' as const,
    counterpartAlias: 'senja.tenang',
    sessionId: 'sess-1',
    showSafetyNotice: true,
    safetyNotice: 'Percakapan ini dipantau sistem keamanan otomatis. Jaga privasimu.',
    lastActivityAt: new Date().toISOString(),
  };

  function stubRoom(overrides: Partial<typeof ROOM> = {}) {
    return stubFetch((url, init) => {
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
      if (url.includes('/rooms/room-1/messages')) {
        return init.method === 'POST' ? ok({ id: 'm-mine' }) : ok({ items: [] });
      }
      if (url.includes('/rooms/room-1/close')) return ok({ status: 'closed' });
      if (url.includes('/rooms/room-1/feedback')) return ok({ recorded: true, message: 'ok' });
      if (url.includes('/escalate')) return ok({ status: 'escalated' });
      if (url.includes('/rooms/room-1')) return ok({ ...ROOM, ...overrides });
      return ok({});
    });
  }

  async function renderRoom() {
    const { default: RoomPage } = await import('../app/(app)/room/[id]/page');
    const { SessionProvider } = await import('../lib/session');
    render(
      <SessionProvider>
        <RoomPage />
      </SessionProvider>,
    );
  }

  it('shows the safety notice once and lets it be acknowledged', async () => {
    const user = userEvent.setup();
    const spy = stubRoom();
    await renderRoom();

    expect(await screen.findByRole('note')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Aku ngerti' }));

    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
    await waitFor(() => expect(requestsOf(spy)).toContain('POST /v1/rooms/room-1/notice-ack'));
  });

  it('renders an incoming socket message without duplicating a sent one', async () => {
    const user = userEvent.setup();
    stubRoom({ showSafetyNotice: false });
    await renderRoom();

    await user.type(await screen.findByLabelText('Tulis pesan'), 'aku di sini kok');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));
    await waitFor(() => expect(screen.getByText('aku di sini kok')).toBeTruthy());

    // Wrapped in act: a socket event is a state update from outside React.
    act(() => {
      socketHandlers.get('room:message')?.({
        roomId: 'room-1',
        messageId: 'm-remote',
        senderAlias: 'senja.tenang',
        body: 'makasih ya',
        createdAt: new Date().toISOString(),
      });
    });

    await waitFor(() => expect(screen.getByText('makasih ya')).toBeTruthy());
    expect(screen.getAllByText('aku di sini kok')).toHaveLength(1);
  });

  it('moves to feedback when the room closes from the other side', async () => {
    stubRoom({ showSafetyNotice: false });
    await renderRoom();

    await screen.findByLabelText('Tulis pesan');
    act(() => {
      socketHandlers.get('room:closed')?.({ roomId: 'room-1', endReason: 'requester_ended' });
    });

    expect(
      await screen.findByRole('heading', { name: 'Percakapan berjalan aman?' }),
    ).toBeTruthy();
  });

  it('escalates without telling the room it happened', async () => {
    const user = userEvent.setup();
    const spy = stubRoom({ showSafetyNotice: false });
    await renderRoom();

    await user.click(await screen.findByRole('button', { name: 'Escalate' }));

    await waitFor(() =>
      expect(requestsOf(spy)).toContain('POST /v1/listener/sessions/sess-1/escalate'),
    );
    // The listener is told; nothing is posted into the conversation itself.
    expect(await screen.findByText(/udah kami teruskan ke tim moderasi/i)).toBeTruthy();
  });
});
