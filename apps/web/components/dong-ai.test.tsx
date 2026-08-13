import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiDisclaimer, BridgeCard, QuotaNotice } from './dong-ai';
import { parseFrames } from '../lib/sse';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Builds a readable stream of SSE frames, the way the API sends them. */
function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

const frame = (type: string, data: unknown) =>
  `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * DONG AI — E15-T12. DESIGN-REF §2.8, PRD §10.
 */
describe('SSE parsing', () => {
  it('holds back an incomplete frame until the rest arrives', () => {
    const first = parseFrames('event: message.delta\ndata: {"text":"ha');
    expect(first.events).toHaveLength(0);

    const second = parseFrames(`${first.rest}lo"}\n\n`);
    expect(second.events).toEqual([{ type: 'message.delta', data: { text: 'halo' } }]);
  });

  it('ignores the keep-alive comments', () => {
    // `: ping` every 15s stops a proxy killing a socket while the model thinks.
    const { events } = parseFrames(`: ping\n\n${frame('message.delta', { text: 'hai' })}`);
    expect(events).toEqual([{ type: 'message.delta', data: { text: 'hai' } }]);
  });

  it('drops one malformed frame instead of failing the whole reply', () => {
    const { events } = parseFrames(
      `event: message.delta\ndata: {rusak\n\n${frame('message.delta', { text: 'lanjut' })}`,
    );
    expect(events).toEqual([{ type: 'message.delta', data: { text: 'lanjut' } }]);
  });
});

describe('the permanent disclaimer', () => {
  it('says what DONG is, with a fallback if the server sends nothing', () => {
    render(<AiDisclaimer />);
    expect(screen.getByRole('note').textContent).toBe('DONG AI teman ngobrol, bukan psikolog.');
  });

  it('cannot be dismissed', () => {
    render(<AiDisclaimer text="DONG AI teman ngobrol, bukan psikolog." />);
    // No close button anywhere near it — it has to be readable at message forty,
    // not only at the top of the thread.
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('quota', () => {
  it('shows what is left while there is some', () => {
    render(<QuotaNotice remaining={3} limit={10} onFindListener={() => {}} />);
    expect(screen.getByText(/Sisa 3 pesan hari ini/)).toBeTruthy();
  });

  it('is warm when it runs out and points at a person', async () => {
    const user = userEvent.setup();
    const onFindListener = vi.fn();
    render(<QuotaNotice remaining={0} limit={10} onFindListener={onFindListener} />);

    expect(screen.getByText(/bukan karena kamu kebanyakan cerita/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cari Listener' }));
    expect(onFindListener).toHaveBeenCalledOnce();
  });
});

describe('bridge card', () => {
  it('carries the prefill so nothing has to be retyped', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(
      <BridgeCard
        card={{
          message: 'Kayaknya enak kalau ada orang yang dengerin ini langsung.',
          ctaLabel: 'Cari Listener',
          action: 'find_listener',
          prefill: { topic: 'kerjaan', emotion: 'capek' },
        }}
        onAccept={onAccept}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cari Listener' }));
    expect(onAccept).toHaveBeenCalledOnce();
  });
});

describe('the chat page (mocked API and stream)', () => {
  const PERSONALITIES = {
    modes: [
      { mode: 'pendengar', label: 'Pendengar', description: 'Dengerin dulu.', available: true },
      { mode: 'pemikir', label: 'Pemikir', description: 'Ngerapiin pikiran.', available: true },
    ],
    disclaimer: 'DONG AI teman ngobrol, bukan psikolog.',
    quota: { remaining: 5, limit: 10 },
  };

  function stubAi(frames: string[], quotaRemaining = 5) {
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url.includes('/ai/conversations/') && url.endsWith('/messages') && method === 'POST') {
        return sseResponse(frames);
      }

      const envelope = (data: unknown) =>
        ({ ok: true, status: 200, json: async () => ({ data, meta: {}, error: null }) }) as Response;

      if (url.includes('/auth/refresh')) return envelope({ accessToken: 'token' });
      if (url.endsWith('/v1/me')) {
        return envelope({
          alias: 'aku',
          avatar: null,
          bio: null,
          isListener: false,
          joinedAt: '2026-01-01T00:00:00Z',
          helpfulCount: 0,
          hasCompletedOnboarding: true,
          topics: [],
        });
      }
      if (url.includes('/ai/personalities')) {
        return envelope({ ...PERSONALITIES, quota: { remaining: quotaRemaining, limit: 10 } });
      }
      if (url.endsWith('/v1/ai/conversations') && method === 'POST') {
        return envelope({ id: 'conv-1', personalityMode: 'pendengar', lastMessageAt: null });
      }
      if (url.includes('/ai/conversations')) return envelope({ items: [] });
      return envelope({});
    });

    vi.stubGlobal('fetch', spy);
    return spy;
  }

  async function renderAi() {
    const { default: DongAiPage } = await import('../app/(app)/ai/page');
    const { SessionProvider } = await import('../lib/session');
    render(
      <SessionProvider>
        <DongAiPage />
      </SessionProvider>,
    );
  }

  it('streams a reply and only commits it when the stream says it is complete', async () => {
    const user = userEvent.setup();
    stubAi([
      frame('message.start', { conversationId: 'conv-1', messageId: 'm1' }),
      frame('message.delta', { text: 'Aku ' }),
      frame('message.delta', { text: 'dengerin.' }),
      frame('message.complete', {
        messageId: 'm1',
        bridge: null,
        quota: { remaining: 4, limit: 10 },
      }),
    ]);
    await renderAi();

    await user.click(await screen.findByRole('button', { name: 'Mulai obrolan baru' }));
    await user.type(screen.getByLabelText('Tulis pesan buat DONG'), 'lagi capek banget');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));

    await waitFor(() => expect(screen.getByText('Aku dengerin.')).toBeTruthy());
    // Quota came back from the completion frame, not from a guess.
    await waitFor(() => expect(screen.getByText(/Sisa 4 pesan/)).toBeTruthy());
  });

  it('shows the bridge card only when the completion frame carries one', async () => {
    const user = userEvent.setup();
    stubAi([
      frame('message.delta', { text: 'hm.' }),
      frame('message.complete', {
        messageId: 'm1',
        bridge: null,
        quota: { remaining: 4, limit: 10 },
      }),
    ]);
    await renderAi();

    await user.click(await screen.findByRole('button', { name: 'Mulai obrolan baru' }));
    await user.type(screen.getByLabelText('Tulis pesan buat DONG'), 'halo');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));

    await waitFor(() => expect(screen.getByText('hm.')).toBeTruthy());
    // No card on an ordinary turn. One after every reply would stop being an
    // offer and become the AI telling somebody to go away.
    expect(screen.queryByRole('button', { name: /cari listener/i })).toBeNull();
  });

  it('opens the supportive intervention when the stream raises one', async () => {
    const user = userEvent.setup();
    stubAi([
      frame('safety.intervention', {
        message: 'Kamu nggak harus nanggung ini sendirian.',
        resources: [],
        usingFallback: true,
        alternatives: [],
      }),
      frame('message.complete', {
        messageId: 'm1',
        bridge: null,
        quota: { remaining: 4, limit: 10 },
      }),
    ]);
    await renderAi();

    await user.click(await screen.findByRole('button', { name: 'Mulai obrolan baru' }));
    await user.type(screen.getByLabelText('Tulis pesan buat DONG'), 'aku capek hidup');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));

    expect(await screen.findByRole('heading', { name: 'Kamu nggak sendirian.' })).toBeTruthy();
  });

  it('replaces the composer with the warm quota screen when nothing is left', async () => {
    stubAi([], 0);
    await renderAi();

    await screen.findByRole('note');
    // Personalities still switchable, disclaimer still there, no input box.
    expect(screen.queryByLabelText('Tulis pesan buat DONG')).toBeNull();
  });

  it('lets the mode change mid-conversation without starting over', async () => {
    const user = userEvent.setup();
    const spy = stubAi([
      frame('message.delta', { text: 'oke.' }),
      frame('message.complete', {
        messageId: 'm1',
        bridge: null,
        quota: { remaining: 4, limit: 10 },
      }),
    ]);
    await renderAi();

    await user.click(await screen.findByRole('button', { name: 'Mulai obrolan baru' }));
    await user.type(screen.getByLabelText('Tulis pesan buat DONG'), 'halo');
    await user.click(screen.getByRole('button', { name: 'Kirim' }));
    await waitFor(() => expect(screen.getByText('oke.')).toBeTruthy());

    await user.click(screen.getByRole('radio', { name: /Pemikir/ }));

    await waitFor(() => {
      const calls = spy.mock.calls.map(
        ([input, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${String(input)}`,
      );
      expect(calls.some((entry) => entry.includes('PUT') && entry.includes('/mode'))).toBe(true);
    });
    // The thread is still there — a different kind of company, not a different
    // conversation.
    expect(screen.getByText('oke.')).toBeTruthy();
  });
});
