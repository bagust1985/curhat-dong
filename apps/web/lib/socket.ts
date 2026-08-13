import { io, type Socket } from 'socket.io-client';

import { getAccessToken, refreshSession } from './api';

/**
 * Realtime connection — E15-T14. TECH-SPEC §3.5.
 *
 * One socket for the whole tab, on the `/rt` namespace. The access token goes
 * in the handshake because the gateway authenticates as middleware, before the
 * first client event lands (rt.gateway.ts).
 *
 * The token expires every 15 minutes, which is shorter than plenty of
 * conversations. So a connection error retries once through
 * `refreshSession()` — without that, a room would go quiet mid-sentence and
 * look like the other person had left.
 */

let socket: Socket | null = null;

function url(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
  return `${base}/rt`;
}

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(url(), {
    transports: ['websocket'],
    autoConnect: true,
    auth: { token: getAccessToken() },
  });

  socket.on('connect_error', () => {
    void (async () => {
      const refreshed = await refreshSession();
      if (!refreshed || !socket) return;
      socket.auth = { token: getAccessToken() };
      socket.connect();
    })();
  });

  return socket;
}

export function closeSocket(): void {
  socket?.close();
  socket = null;
}

export interface RoomMessageEvent {
  roomId: string;
  messageId: string;
  senderAlias: string;
  body: string;
  createdAt: string;
}

export interface RoomTypingEvent {
  roomId: string;
  alias: string;
  isTyping: boolean;
}

export interface RoomPresenceEvent {
  roomId: string;
  alias: string;
  online: boolean;
}

export interface RoomClosedEvent {
  roomId: string;
  endReason: string;
}
