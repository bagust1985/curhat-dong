'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../../lib/api';
import { relativeTime } from '../../../../lib/relative-time';
import { getSocket, type RoomClosedEvent, type RoomMessageEvent, type RoomPresenceEvent, type RoomTypingEvent } from '../../../../lib/socket';
import { BlockDialog, ReportSheet } from '../../../../components/safety';
import { Textarea } from '../../../../components/ui';
import {
  RoomHeader,
  RoomTranscript,
  SafetyNotice,
  SessionFeedback,
  ThankYouState,
  type RoomMessage,
} from '../../../../components/room';

/**
 * `/room/:id` — E15-T14. DESIGN-REF §2.11, PRD §11.
 *
 * Messages arrive over the socket and are also POSTed over HTTP — the POST is
 * what persists them, the socket is what makes the other side see them now. A
 * message is rendered locally as soon as it is sent and reconciled when the
 * echo arrives, so nothing appears twice.
 *
 * The room ends in feedback, not in a closed door: the requester is asked
 * whether they felt heard, the listener whether the conversation was safe.
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

interface ApiRoomMessage {
  id: string;
  body: string;
  senderAlias: string;
  isMine: boolean;
  createdAt: string;
}

type Phase = 'chat' | 'feedback' | 'thanks';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [typingAlias, setTypingAlias] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('chat');
  const [sheet, setSheet] = useState<'none' | 'report' | 'block'>('none');
  const [error, setError] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<RoomDetail>(`/rooms/${roomId}`);
        setRoom(data);
        setNoticeOpen(data.showSafetyNotice);
        if (data.status === 'closed') setPhase('feedback');

        const { data: history } = await api<{ items: ApiRoomMessage[] }>(
          `/rooms/${roomId}/messages`,
        );
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
  }, [roomId]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('room:join', { roomId });

    const onMessage = (payload: RoomMessageEvent) => {
      if (payload.roomId !== roomId) return;
      setMessages((current) => {
        // The sender already rendered this locally; the echo replaces it rather
        // than adding a second copy.
        if (current.some((message) => message.id === payload.messageId)) return current;
        return [
          ...current.filter(
            (message) => !message.id?.startsWith('local-') || message.body !== payload.body,
          ),
          {
            id: payload.messageId,
            body: payload.body,
            fromMe: false,
            senderAlias: payload.senderAlias,
            timeLabel: relativeTime(payload.createdAt),
          },
        ];
      });
    };

    const onTyping = (payload: RoomTypingEvent) => {
      if (payload.roomId !== roomId) return;
      setTypingAlias(payload.isTyping ? payload.alias : null);
    };

    const onPresence = (payload: RoomPresenceEvent) => {
      if (payload.roomId === roomId) setOnline(payload.online);
    };

    const onClosed = (payload: RoomClosedEvent) => {
      if (payload.roomId === roomId) setPhase('feedback');
    };

    socket.on('room:message', onMessage);
    socket.on('room:typing', onTyping);
    socket.on('room:presence', onPresence);
    socket.on('room:closed', onClosed);

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('room:message', onMessage);
      socket.off('room:typing', onTyping);
      socket.off('room:presence', onPresence);
      socket.off('room:closed', onClosed);
    };
  }, [roomId]);

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
      const { data } = await api<{ id: string }>(`/rooms/${roomId}/messages`, {
        method: 'POST',
        body: { body, clientMessageId: localId },
      });
      // Falls back to the local id when the response has no id: an undefined
      // id lands in the dedupe path below and takes the whole room down.
      setMessages((current) =>
        current.map((message) =>
          message.id === localId ? { ...message, id: data?.id ?? localId } : message,
        ),
      );
    } catch {
      setMessages((current) => current.filter((message) => message.id !== localId));
      setError('Pesanmu belum kekirim. Coba lagi ya.');
    }
  }, [draft, roomId]);

  const notifyTyping = useCallback(() => {
    const socket = getSocket();
    socket.emit('room:typing', { roomId, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('room:typing', { roomId, isTyping: false });
    }, 2000);
  }, [roomId]);

  const endSession = useCallback(async () => {
    try {
      await api(`/rooms/${roomId}/close`, {
        method: 'POST',
        body: { reason: room?.role === 'listener' ? 'listener_ended' : 'requester_ended' },
      });
    } catch {
      /* the room may already be closed; the feedback screen is still correct */
    }
    setPhase('feedback');
  }, [room?.role, roomId]);

  const escalate = useCallback(async () => {
    if (!room?.sessionId) return;
    try {
      await api(`/listener/sessions/${room.sessionId}/escalate`, { method: 'POST', body: {} });
      setError(null);
      setTypingAlias(null);
      // Says what happened, plainly. The listener needs to know a human is now
      // involved, and the requester is never told (PRD §15.3).
      setError('Udah kami teruskan ke tim moderasi. Tetap temani dia ya.');
    } catch {
      setError('Escalate-nya belum kekirim. Coba sekali lagi ya.');
    }
  }, [room?.sessionId]);

  if (!room) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10">
        <p role="status">{error ?? 'Lagi buka ruangnya…'}</p>
      </main>
    );
  }

  if (phase === 'thanks') {
    return (
      <main className="mx-auto max-w-md px-[var(--spacing-gutter)] py-16">
        <ThankYouState role={room.role} onHome={() => router.push('/home')} />
      </main>
    );
  }

  if (phase === 'feedback') {
    return (
      <main className="mx-auto max-w-md px-[var(--spacing-gutter)] py-16">
        <SessionFeedback
          role={room.role}
          onSubmit={(payload) => {
            void (async () => {
              try {
                await api(`/rooms/${roomId}/feedback`, { method: 'POST', body: payload });
              } catch {
                /* the thank-you is not conditional on the answer landing */
              }
              setPhase('thanks');
            })();
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-[var(--spacing-gutter)] py-6">
      <RoomHeader
        counterpartAlias={room.counterpartAlias ?? 'Seseorang'}
        role={room.role}
        online={online}
        canEscalate={room.role === 'listener' && room.sessionId !== null}
        onReport={() => setSheet('report')}
        onBlock={() => setSheet('block')}
        onEnd={() => void endSession()}
        onEscalate={() => void escalate()}
      />

      {noticeOpen ? (
        <div className="mt-4">
          <SafetyNotice
            text={room.safetyNotice}
            onAcknowledge={() => {
              setNoticeOpen(false);
              void api(`/rooms/${roomId}/notice-ack`, { method: 'POST', body: {} }).catch(
                () => undefined,
              );
            }}
          />
        </div>
      ) : null}

      <div className="mt-4 flex-1">
        <RoomTranscript messages={messages} typingAlias={typingAlias} />
      </div>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--color-muted)]">
        {error}
      </p>

      <div className="sticky bottom-0 flex gap-2 bg-[var(--color-bg)] py-3">
        <label htmlFor="room-input" className="sr-only">
          Tulis pesan
        </label>
        <Textarea
          id="room-input"
          rows={2}
          value={draft}
          maxLength={4000}
          placeholder="Tulis pesan…"
          onChange={(event) => {
            setDraft(event.target.value);
            notifyTyping();
          }}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={draft.trim().length === 0}
          className="min-h-[var(--size-touch)] self-end rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)] disabled:opacity-60"
        >
          Kirim
        </button>
      </div>

      {sheet === 'report' ? (
        <ReportSheet
          onSubmit={(category, note) => {
            void (async () => {
              try {
                await api('/reports', {
                  method: 'POST',
                  body: {
                    targetType: 'user',
                    targetId: room.roomId,
                    category,
                    ...(note ? { note } : {}),
                  },
                });
              } finally {
                setSheet('none');
              }
            })();
          }}
          onClose={() => setSheet('none')}
        />
      ) : null}

      {sheet === 'block' ? (
        <BlockDialog
          alias={room.counterpartAlias ?? 'orang ini'}
          onConfirm={() => {
            void (async () => {
              try {
                await api(`/rooms/${roomId}/block`, { method: 'POST', body: {} });
                router.push('/home');
              } finally {
                setSheet('none');
              }
            })();
          }}
          onCancel={() => setSheet('none')}
        />
      ) : null}
    </main>
  );
}
