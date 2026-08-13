import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, TextInput, View } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';

import { api, apiBaseUrl, getAccessToken } from '../../lib/api';
import { parseFrames } from '../../lib/sse-parse';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../../components/ui';

/**
 * DONG AI — E16-T06. DESIGN-REF §2.8, PRD §10.
 *
 * `expo/fetch` rather than the React Native global: RN's `fetch` has no
 * `response.body`, so a streamed reply arrives only when it is finished — which
 * is the opposite of streaming. Expo's WinterCG fetch exposes the stream, and
 * that is the whole reason this screen can render tokens as they land.
 *
 * The reply is committed to the thread only on `message.complete`, so a
 * connection that drops mid-sentence — which on mobile data it will — leaves
 * nothing that looks like a finished answer.
 */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
}

export default function DongAiScreen() {
  const router = useRouter();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [disclaimer, setDisclaimer] = useState('DONG AI teman ngobrol, bukan psikolog.');
  const [quota, setQuota] = useState({ remaining: 1, limit: 1 });
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<{ disclaimer: string; quota: { remaining: number; limit: number } }>(
          '/ai/personalities',
        );
        setDisclaimer(data.disclaimer);
        setQuota(data.quota);
      } catch {
        setError('Belum bisa nyambung ke DONG. Coba lagi sebentar lagi ya.');
      }
    })();
  }, []);

  // Backgrounding the app kills the socket on many Android builds. Aborting on
  // the way out means the half-arrived reply is dropped rather than resumed
  // into a corrupted bubble when the person comes back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && abort.current) {
        abort.current.abort();
        abort.current = null;
        setStreaming(null);
      }
    });
    return () => subscription.remove();
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || quota.remaining <= 0) return;

    let id = conversationId;
    if (!id) {
      try {
        const { data } = await api<{ id: string }>('/ai/conversations', {
          method: 'POST',
          body: { personalityMode: 'pendengar' },
        });
        id = data.id;
        setConversationId(id);
      } catch {
        setError('Belum bisa mulai obrolan. Coba lagi ya.');
        return;
      }
    }

    setDraft('');
    setError(null);
    setMessages((current) => [
      ...current,
      { id: `local-${current.length}`, role: 'user', body: text },
    ]);
    setStreaming('');

    const controller = new AbortController();
    abort.current = controller;
    let assembled = '';
    let buffer = '';

    try {
      const response = await expoFetch(`${apiBaseUrl()}/v1/ai/conversations/${id}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'x-client-platform': 'mobile',
          ...(getAccessToken() ? { authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify({ body: text }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setStreaming(null);
        setError('DONG lagi nggak bisa jawab. Coba lagi ya.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseFrames(buffer);
        buffer = rest;

        for (const event of events) {
          if (event.type === 'message.delta') {
            assembled += (event.data as { text: string }).text;
            setStreaming(assembled);
          } else if (event.type === 'message.complete') {
            const data = event.data as {
              messageId: string;
              quota: { remaining: number; limit: number };
            };
            setMessages((current) => [
              ...current,
              { id: data.messageId, role: 'assistant', body: assembled },
            ]);
            setStreaming(null);
            setQuota(data.quota);
          } else if (event.type === 'error') {
            setStreaming(null);
            setError('DONG lagi nggak bisa jawab. Coba lagi ya.');
          }
        }
      }
    } catch {
      // Signal dropped mid-reply — the usual case on mobile data.
      setStreaming(null);
      setError('Sambungannya putus di tengah jalan. Coba kirim lagi ya.');
    } finally {
      abort.current = null;
    }
  }, [conversationId, draft, quota.remaining]);

  return (
    <ScreenScroll>
      <Heading>DONG AI</Heading>
      {/* Outside the thread and never dismissable: readable at message forty. */}
      <Text
        accessibilityRole="text"
        className="rounded-chip border border-border bg-surface-alt px-3 py-2 text-center text-xs text-text"
      >
        {disclaimer}
      </Text>

      {messages.map((message) => (
        <View
          key={message.id}
          className={`max-w-[85%] rounded-curhat px-3 py-2 ${
            message.role === 'user' ? 'self-end bg-primary' : 'self-start border border-border bg-surface'
          }`}
        >
          <Text className={message.role === 'user' ? 'text-primary-fg' : 'text-text'}>
            {message.body}
          </Text>
        </View>
      ))}

      {streaming !== null ? (
        <View className="max-w-[85%] self-start rounded-curhat border border-border bg-surface px-3 py-2">
          <Text accessibilityLiveRegion="polite" className="text-text">
            {streaming.length === 0 ? 'DONG lagi ngetik…' : streaming}
          </Text>
        </View>
      ) : null}

      <ErrorText message={error} />

      {quota.remaining > 0 ? (
        <>
          <Text className="text-xs text-muted">
            Sisa {quota.remaining} pesan hari ini dari {quota.limit}.
          </Text>
          <TextInput
            accessibilityLabel="Tulis pesan buat DONG"
            value={draft}
            onChangeText={setDraft}
            multiline
            className="min-h-16 rounded-curhat border border-border bg-surface p-3 text-text"
          />
          <PrimaryButton
            label="Kirim"
            disabled={draft.trim().length === 0 || streaming !== null}
            onPress={() => void send()}
          />
        </>
      ) : (
        <View className="rounded-curhat border border-border bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-text">
            Jatah ngobrol sama DONG hari ini udah habis
          </Text>
          <Body muted>
            Bukan karena kamu kebanyakan cerita. Besok jatahnya balik lagi — dan kalau malam ini
            masih berat, ada orang yang bisa dengerin.
          </Body>
          <SecondaryButton
            label="Cari Listener"
            onPress={() => router.push('/listener/request')}
          />
        </View>
      )}
    </ScreenScroll>
  );
}
