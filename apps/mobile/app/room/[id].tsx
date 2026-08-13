import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { api, apiBaseUrl, getAccessToken } from '../../lib/api';
import { relativeTime } from '../../lib/relative-time';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../../components/ui';

/**
 * Private room — E16-T07. DESIGN-REF §2.11, PRD §11, §15.
 *
 * ## Screenshot protection
 *
 * `FLAG_SECURE` is applied through `expo-screen-capture` when the module is
 * present. It is loaded lazily and its absence is tolerated, because a missing
 * native module must not make the room unopenable — a person waiting to talk to
 * somebody should not meet a crash.
 *
 * The notice says what is actually true. PRD §15 forbids promising screenshots
 * are impossible: FLAG_SECURE helps on Android and nothing stops a second phone
 * pointed at the screen. Telling someone their words are safe when they might
 * not be is worse than telling them the truth.
 */

interface RoomDetail {
  roomId: string;
  role: 'requester' | 'listener';
  status: 'open' | 'closed';
  counterpartAlias: string | null;
  sessionId: string | null;
  showSafetyNotice: boolean;
  safetyNotice: string;
}

interface Message {
  id: string;
  body: string;
  fromMe: boolean;
  senderAlias: string;
  timeLabel: string;
}

export default function RoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [typingAlias, setTypingAlias] = useState<string | null>(null);
  const [phase, setPhase] = useState<'chat' | 'feedback' | 'thanks'>('chat');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (Platform.OS !== 'android') return;
      try {
        const module = await import('expo-screen-capture');
        if (active) await module.preventScreenCaptureAsync();
      } catch {
        // Not installed in this build. The room still works; the notice already
        // says screenshots cannot be fully prevented.
      }
    })();

    return () => {
      active = false;
      void (async () => {
        try {
          const module = await import('expo-screen-capture');
          await module.allowScreenCaptureAsync();
        } catch {
          /* nothing to undo */
        }
      })();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<RoomDetail>(`/rooms/${id}`);
        setRoom(data);
        if (data.status === 'closed') setPhase('feedback');

        const { data: history } = await api<{
          items: Array<{ id: string; body: string; senderAlias: string; isMine: boolean; createdAt: string }>;
        }>(`/rooms/${id}/messages`);

        setMessages(
          history.items.map((message) => ({
            id: message.id,
            body: message.body,
            fromMe: message.isMine,
            senderAlias: message.senderAlias,
            timeLabel: relativeTime(message.createdAt),
          })),
        );
      } catch {
        setError('Ruangnya belum bisa dibuka. Coba lagi sebentar lagi ya.');
      }
    })();
  }, [id]);

  useEffect(() => {
    const socket = io(`${apiBaseUrl()}/rt`, {
      transports: ['websocket'],
      auth: { token: getAccessToken() },
      // Mobile networks drop constantly; reconnecting is the normal case, not
      // an error worth telling the user about.
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;
    socket.emit('room:join', { roomId: id });
    socket.on('connect', () => socket.emit('room:join', { roomId: id }));

    socket.on('room:message', (payload: { roomId: string; messageId: string; senderAlias: string; body: string; createdAt: string }) => {
      if (payload.roomId !== id) return;
      setMessages((current) =>
        current.some((message) => message.id === payload.messageId)
          ? current
          : [
              ...current.filter(
                (message) => !message.id.startsWith('local-') || message.body !== payload.body,
              ),
              {
                id: payload.messageId,
                body: payload.body,
                fromMe: false,
                senderAlias: payload.senderAlias,
                timeLabel: relativeTime(payload.createdAt),
              },
            ],
      );
    });

    socket.on('room:typing', (payload: { roomId: string; alias: string; isTyping: boolean }) => {
      if (payload.roomId === id) setTypingAlias(payload.isTyping ? payload.alias : null);
    });

    socket.on('room:closed', (payload: { roomId: string }) => {
      if (payload.roomId === id) setPhase('feedback');
    });

    return () => {
      socket.emit('room:leave', { roomId: id });
      socket.close();
      socketRef.current = null;
    };
  }, [id]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (body.length === 0) return;
    setDraft('');

    const localId = `local-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: localId, body, fromMe: true, senderAlias: 'Kamu', timeLabel: 'sekarang' },
    ]);

    try {
      const { data } = await api<{ id: string }>(`/rooms/${id}/messages`, {
        method: 'POST',
        body: { body, clientMessageId: localId },
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === localId ? { ...message, id: data?.id ?? localId } : message,
        ),
      );
    } catch {
      setMessages((current) => current.filter((message) => message.id !== localId));
      setError('Pesanmu belum kekirim. Coba lagi ya.');
    }
  }, [draft, id]);

  if (phase === 'thanks') {
    return (
      <ScreenScroll>
        <Heading>
          {room?.role === 'listener' ? 'Makasih udah mau dengerin 🤍' : 'Makasih udah mau cerita 🤍'}
        </Heading>
        <PrimaryButton label="Balik ke beranda" onPress={() => router.replace('/')} />
      </ScreenScroll>
    );
  }

  if (phase === 'feedback') {
    const answer = (payload: Record<string, unknown>) => {
      void api(`/rooms/${id}/feedback`, { method: 'POST', body: payload })
        .catch(() => undefined)
        .finally(() => setPhase('thanks'));
    };

    return (
      <ScreenScroll>
        {room?.role === 'listener' ? (
          <>
            <Heading>Percakapan berjalan aman?</Heading>
            <PrimaryButton label="Ya" onPress={() => answer({ feltSafe: true })} />
            <SecondaryButton label="Nggak" onPress={() => answer({ feltSafe: false })} />
          </>
        ) : (
          <>
            <Heading>Kamu merasa didengar?</Heading>
            <PrimaryButton label="Iya" onPress={() => answer({ feltHeard: 'yes' })} />
            <SecondaryButton label="Sedikit" onPress={() => answer({ feltHeard: 'somewhat' })} />
            <SecondaryButton label="Belum" onPress={() => answer({ feltHeard: 'no' })} />
          </>
        )}
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <Text className="font-semibold text-text">{room?.counterpartAlias ?? 'Seseorang'}</Text>
        <View className="flex-row flex-wrap gap-3">
          {room?.role === 'listener' && room.sessionId ? (
            // Always visible, never in a menu.
            <Text
              accessibilityRole="button"
              accessibilityLabel="Escalate ke tim moderasi"
              onPress={() => {
                void api(`/listener/sessions/${room.sessionId}/escalate`, { method: 'POST', body: {} })
                  .then(() => setError('Udah kami teruskan ke tim moderasi. Tetap temani dia ya.'))
                  .catch(() => setError('Escalate-nya belum kekirim. Coba sekali lagi ya.'));
              }}
              className="rounded-action border border-danger px-4 py-2 text-sm font-semibold text-text"
            >
              Escalate
            </Text>
          ) : null}
          <Text
            accessibilityRole="button"
            onPress={() => {
              void api(`/rooms/${id}/close`, {
                method: 'POST',
                body: { reason: room?.role === 'listener' ? 'listener_ended' : 'requester_ended' },
              }).catch(() => undefined);
              setPhase('feedback');
            }}
            className="text-sm text-muted underline"
          >
            Akhiri sesi
          </Text>
        </View>
      </View>

      {room?.showSafetyNotice ? (
        <View className="rounded-curhat border border-border bg-surface-alt p-4">
          <Text className="text-sm leading-5 text-text">{room.safetyNotice}</Text>
        </View>
      ) : null}

      {messages.map((message) => (
        <View
          key={message.id}
          className={`max-w-[85%] rounded-curhat px-3 py-2 ${
            message.fromMe ? 'self-end bg-primary' : 'self-start border border-border bg-surface'
          }`}
        >
          <Text className={message.fromMe ? 'text-primary-fg' : 'text-text'}>{message.body}</Text>
        </View>
      ))}

      {typingAlias ? <Body muted>{typingAlias} lagi ngetik…</Body> : null}

      <ErrorText message={error} />

      <TextInput
        accessibilityLabel="Tulis pesan"
        value={draft}
        onChangeText={(value) => {
          setDraft(value);
          socketRef.current?.emit('room:typing', { roomId: id, isTyping: true });
        }}
        multiline
        maxLength={4000}
        className="min-h-16 rounded-curhat border border-border bg-surface p-3 text-text"
      />
      <PrimaryButton label="Kirim" disabled={draft.trim().length === 0} onPress={() => void send()} />
    </ScreenScroll>
  );
}
