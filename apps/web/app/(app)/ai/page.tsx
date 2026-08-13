'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, getAccessToken } from '../../../lib/api';
import { relativeTime } from '../../../lib/relative-time';
import { streamSse } from '../../../lib/sse';
import { EmptyState } from '../../../components/conversation';
import {
  AiDisclaimer,
  BridgeCard,
  MessageList,
  PersonalityPicker,
  QuotaNotice,
  TypingIndicator,
  type BridgeCardData,
  type ChatMessage,
  type PersonalityOption,
} from '../../../components/dong-ai';
import {
  SupportiveIntervention,
  type SupportiveInterventionData,
} from '../../../components/supportive-intervention';

/**
 * `/ai` — E15-T12. DESIGN-REF §2.8, PRD §10.
 *
 * The reply arrives over SSE and is rendered token by token; the bubble is only
 * committed to the list when `message.complete` lands, so an interrupted stream
 * leaves nothing that looks like a finished answer.
 *
 * Two rules this screen is built around:
 *
 *  - **the disclaimer never scrolls away.** It sits outside the thread, always
 *    rendered — not a one-time banner at the top of the conversation;
 *  - **the bridge card is the server's decision**, shown only when
 *    `message.complete` carries one. Offering a human after every single reply
 *    turns the offer into the AI repeatedly telling somebody to go elsewhere.
 */

interface ConversationSummary {
  id: string;
  personalityMode: string;
  lastMessageAt: string | null;
  messageCount?: number;
}

interface ApiMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  createdAt: string;
}

export default function DongAiPage() {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [personalities, setPersonalities] = useState<PersonalityOption[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string>('');
  const [quota, setQuota] = useState<{ remaining: number; limit: number }>({
    remaining: 1,
    limit: 1,
  });
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [bridge, setBridge] = useState<BridgeCardData | null>(null);
  const [intervention, setIntervention] = useState<SupportiveInterventionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<{
          modes: PersonalityOption[];
          disclaimer: string;
          quota: { remaining: number; limit: number };
        }>('/ai/personalities');
        setPersonalities(data.modes);
        setDisclaimer(data.disclaimer);
        setQuota(data.quota);
        setMode((current) => current ?? data.modes.find((item) => item.available)?.mode ?? null);
      } catch {
        setError('Belum bisa nyambung ke DONG. Coba lagi sebentar lagi ya.');
      }

      try {
        const { data } = await api<{ items: ConversationSummary[] }>('/ai/conversations');
        setConversations(data.items);
      } catch {
        setConversations([]);
      }
    })();
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setBridge(null);
    try {
      const { data } = await api<{ items: ApiMessage[] }>(`/ai/conversations/${id}/messages`);
      setMessages(
        data.items.map((message) => ({
          id: message.id,
          role: message.role,
          body: message.body,
          createdAtLabel: relativeTime(message.createdAt),
        })),
      );
    } catch {
      setMessages([]);
    }
  }, []);

  const startConversation = useCallback(async () => {
    try {
      const { data } = await api<ConversationSummary>('/ai/conversations', {
        method: 'POST',
        body: { personalityMode: mode ?? 'pendengar' },
      });
      setConversations((current) => [data, ...current]);
      setActiveId(data.id);
      setMessages([]);
      return data.id;
    } catch {
      setError('Belum bisa mulai obrolan. Coba lagi ya.');
      return null;
    }
  }, [mode]);

  const changeMode = useCallback(
    async (next: string) => {
      setMode(next);
      if (!activeId) return;
      try {
        // Mid-chat switch is allowed and keeps the thread: the person is asking
        // for a different kind of company, not a different conversation.
        await api(`/ai/conversations/${activeId}/mode`, {
          method: 'PUT',
          body: { personalityMode: next },
        });
      } catch {
        setError('Gaya ngobrolnya belum kesimpan. Coba lagi ya.');
      }
    },
    [activeId],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || quota.remaining <= 0) return;

    const conversationId = activeId ?? (await startConversation());
    if (!conversationId) return;

    setDraft('');
    setError(null);
    setBridge(null);
    setMessages((current) => [
      ...current,
      { id: `local-${current.length}`, role: 'user', body: text, createdAtLabel: 'sekarang' },
    ]);
    setStreaming('');

    const controller = new AbortController();
    abort.current = controller;

    let assembled = '';

    try {
      await streamSse({
        url: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101'}/v1/ai/conversations/${conversationId}/messages`,
        body: { body: text },
        accessToken: getAccessToken(),
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'message.delta') {
            assembled += (event.data as { text: string }).text;
            setStreaming(assembled);
          } else if (event.type === 'safety.intervention') {
            setIntervention(event.data as SupportiveInterventionData);
          } else if (event.type === 'message.complete') {
            const data = event.data as {
              messageId: string;
              bridge: BridgeCardData | null;
              quota: { remaining: number; limit: number };
            };
            setMessages((current) => [
              ...current,
              {
                id: data.messageId,
                role: 'assistant',
                body: assembled,
                createdAtLabel: 'baru aja',
              },
            ]);
            setStreaming(null);
            setQuota(data.quota);
            setBridge(data.bridge);
          } else if (event.type === 'error') {
            const data = event.data as { code: string; message: string };
            setStreaming(null);
            setError(
              data.code === 'AI_QUOTA_EXCEEDED'
                ? null
                : (data.message ?? 'DONG lagi nggak bisa jawab. Coba lagi ya.'),
            );
            if (data.code === 'AI_QUOTA_EXCEEDED') setQuota({ ...quota, remaining: 0 });
          }
        },
      });
    } catch {
      setStreaming(null);
      setError('Sambungannya putus di tengah jalan. Coba kirim lagi ya.');
    } finally {
      abort.current = null;
    }
  }, [activeId, draft, quota, startConversation]);

  useEffect(() => () => abort.current?.abort(), []);

  if (intervention) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10">
        <SupportiveIntervention
          data={intervention}
          onClose={() => setIntervention(null)}
          onTalkToAi={() => setIntervention(null)}
          onFindListener={() => router.push('/listener/request')}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-[var(--spacing-gutter)] py-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-bold text-[var(--color-text)]">DONG AI</h1>
        <AiDisclaimer text={disclaimer} />
        <PersonalityPicker
          options={personalities}
          value={mode}
          onChange={(next) => void changeMode(next)}
        />
      </header>

      {activeId === null ? (
        <section className="mt-6 flex flex-col gap-4">
          {conversations.length === 0 ? (
            <EmptyState context="aiConversations" onAction={() => void startConversation()} />
          ) : (
            <ul className="flex flex-col gap-2">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-[var(--color-text)]"
                  >
                    <span className="block font-semibold">Obrolan sama DONG</span>
                    <span className="block text-sm text-[var(--color-muted)]">
                      {conversation.lastMessageAt
                        ? relativeTime(conversation.lastMessageAt)
                        : 'Belum ada pesan'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => void startConversation()}
            className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
          >
            Mulai obrolan baru
          </button>
        </section>
      ) : (
        <section className="mt-6 flex flex-1 flex-col">
          <div className="flex-1">
            <MessageList messages={messages} streaming={streaming} />
            {streaming !== null && streaming.length === 0 ? <TypingIndicator /> : null}
            {bridge ? (
              <div className="mt-4">
                <BridgeCard
                  card={bridge}
                  onAccept={() => {
                    const query = new URLSearchParams();
                    if (bridge.prefill.topic) query.set('topic', bridge.prefill.topic);
                    if (bridge.prefill.emotion) query.set('emotion', bridge.prefill.emotion);
                    router.push(`/listener/request?${query.toString()}`);
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-[var(--color-bg)] pb-4">
            <QuotaNotice
              remaining={quota.remaining}
              limit={quota.limit}
              onFindListener={() => router.push('/listener/request')}
            />

            <p role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--color-danger)]">
              {error}
            </p>

            {quota.remaining > 0 ? (
              <div className="flex gap-2">
                <label htmlFor="ai-input" className="sr-only">
                  Tulis pesan buat DONG
                </label>
                <textarea
                  id="ai-input"
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="flex-1 rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={draft.trim().length === 0 || streaming !== null}
                  className="min-h-[var(--size-touch)] self-end rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
                >
                  Kirim
                </button>
              </div>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}
