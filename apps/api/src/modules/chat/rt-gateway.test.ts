import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@curhat/database';

import { AppModule } from '../../app.module.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RedisIoAdapter } from '../../common/redis-io.adapter.js';
import { AI_PROVIDER_RESOLVER } from '../ai/ai-gateway.service.js';
import { SessionService } from '../auth/session.service.js';
import { scriptedResolver } from './scripted-provider.js';

config({ path: join(process.cwd(), '../../.env') });

const describeDb = process.env['DATABASE_URL'] ? describe : describe.skip;

const CONNECT_TIMEOUT = 8_000;

describeDb('realtime gateway /rt (E11-T01 to T04)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl: string;

  let requesterId: string;
  let listenerId: string;
  let strangerId: string;
  let requesterToken: string;
  let listenerToken: string;
  let strangerToken: string;
  let roomId: string;

  const createdUserIds: string[] = [];
  const openSockets: Socket[] = [];

  function connect(token?: string): Socket {
    const socket = io(`${baseUrl}/rt`, {
      transports: ['websocket'],
      ...(token ? { auth: { token } } : {}),
      reconnection: false,
      timeout: CONNECT_TIMEOUT,
      // Without this, socket.io-client hands back the *same* socket for a URL
      // it has already seen — so every "second user" in this file would
      // silently be the first one, still authenticated as them.
      forceNew: true,
    });
    openSockets.push(socket);
    return socket;
  }

  /** Resolves on the first of the named events, so a failure is not a hang. */
  function once<T>(socket: Socket, event: string, timeoutMs = CONNECT_TIMEOUT): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out on ${event}`)), CONNECT_TIMEOUT);
      socket.emit(event, payload, (ack: T) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Message classification runs in the background of every send; a live
      // provider would put a network round trip inside a socket test.
      .overrideProvider(AI_PROVIDER_RESOLVER)
      .useValue(scriptedResolver())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    // Same wiring as main.ts, so the test exercises the adapter that runs in
    // production rather than a friendlier in-memory one.
    app.useWebSocketAdapter(await RedisIoAdapter.create(app));
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get<PrismaClient>(PRISMA);
    const sessions = app.get(SessionService);

    const [requester, listener, stranger] = await Promise.all([
      prisma.user.create({ data: {} }),
      prisma.user.create({ data: {} }),
      prisma.user.create({ data: {} }),
    ]);
    requesterId = requester.id;
    listenerId = listener.id;
    strangerId = stranger.id;
    createdUserIds.push(requesterId, listenerId, strangerId);

    requesterToken = (await sessions.issue(requesterId)).accessToken;
    listenerToken = (await sessions.issue(listenerId)).accessToken;
    strangerToken = (await sessions.issue(strangerId)).accessToken;

    const room = await prisma.chatRoom.create({ data: { type: 'listener_session' } });
    roomId = room.id;
    await prisma.roomMember.createMany({
      data: [
        { roomId, userId: requesterId, role: 'requester' },
        { roomId, userId: listenerId, role: 'listener' },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) socket.disconnect();
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('refuses a connection with no token', async () => {
    const socket = connect();

    const error = await once<Error & { data?: { code: string } }>(socket, 'connect_error');

    // Refused during the handshake, so no event can ever arrive on it.
    expect(error.data?.code).toBe('UNAUTHORIZED');
    expect(socket.connected).toBe(false);
  });

  it('refuses a connection with a token that is not ours', async () => {
    const socket = connect('not.a.real.token');

    const error = await once<Error & { data?: { code: string } }>(socket, 'connect_error');

    expect(error.data?.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('is usable the instant connect fires', async () => {
    // The race this guards: a client that emits immediately, before a
    // handshake doing database work would have finished.
    const socket = connect(requesterToken);
    await once(socket, 'connect');

    const ack = await emit<{ ok: boolean }>(socket, 'room:join', { roomId });

    expect(ack.ok).toBe(true);
  });

  it('accepts a valid token', async () => {
    const socket = connect(requesterToken);

    await once(socket, 'connect');

    expect(socket.connected).toBe(true);
  });

  it('refuses to join a room the caller is not in', async () => {
    const socket = connect(strangerToken);
    await once(socket, 'connect');

    const ack = await emit<{ ok: boolean; code?: string }>(socket, 'room:join', { roomId });

    // The mandatory security check of E11-T02, over the wire.
    expect(ack.ok).toBe(false);
    expect(ack.code).toBe('ROOM_NOT_MEMBER');
  });

  it('refuses to send into a room the caller is not in', async () => {
    const socket = connect(strangerToken);
    await once(socket, 'connect');

    const ack = await emit<{ ok: boolean; code?: string }>(socket, 'room:message', {
      roomId,
      body: 'halo?',
    });

    expect(ack.ok).toBe(false);
    expect(ack.code).toBe('ROOM_NOT_MEMBER');
    expect(await prisma.message.count({ where: { roomId, senderId: strangerId } })).toBe(0);
  });

  it('delivers a message to the other member and stores it', async () => {
    const sender = connect(requesterToken);
    const receiver = connect(listenerToken);
    await Promise.all([once(sender, 'connect'), once(receiver, 'connect')]);
    await Promise.all([
      emit(sender, 'room:join', { roomId }),
      emit(receiver, 'room:join', { roomId }),
    ]);

    const delivered = once<{ id: string; body: string }>(receiver, 'room:message');
    const startedAt = Date.now();
    const ack = await emit<{ ok: boolean; messageId?: string }>(sender, 'room:message', {
      roomId,
      body: 'halo, makasih udah mau dengerin',
    });
    const received = await delivered;

    expect(ack.ok).toBe(true);
    expect(received.body).toBe('halo, makasih udah mau dengerin');
    expect(received.id).toBe(ack.messageId);
    // TECH-SPEC §8.3 targets under 2s end to end.
    expect(Date.now() - startedAt).toBeLessThan(2_000);

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: received.id } });
    expect(stored.roomId).toBe(roomId);
  });

  it('announces presence to the other member on join', async () => {
    const watcher = connect(listenerToken);
    await once(watcher, 'connect');
    await emit(watcher, 'room:join', { roomId });

    const presence = once<{ userId: string; online: boolean }>(watcher, 'room:presence');
    const joiner = connect(requesterToken);
    await once(joiner, 'connect');
    await emit(joiner, 'room:join', { roomId });

    expect(await presence).toEqual({ userId: requesterId, online: true });
  });

  it('rejects an empty message before it reaches the database', async () => {
    const socket = connect(requesterToken);
    await once(socket, 'connect');
    await emit(socket, 'room:join', { roomId });

    const ack = await emit<{ ok: boolean; code?: string }>(socket, 'room:message', {
      roomId,
      body: '   ',
    });

    expect(ack.ok).toBe(false);
    expect(ack.code).toBe('VALIDATION_ERROR');
  });

  it('does not deliver the same message twice on a retry', async () => {
    const sender = connect(requesterToken);
    await once(sender, 'connect');
    await emit(sender, 'room:join', { roomId });

    const clientMessageId = `retry-${Date.now()}`;
    const first = await emit<{ ok: boolean; messageId?: string }>(sender, 'room:message', {
      roomId,
      body: 'kekirim nggak ya',
      clientMessageId,
    });
    const retry = await emit<{ ok: boolean; messageId?: string }>(sender, 'room:message', {
      roomId,
      body: 'kekirim nggak ya',
      clientMessageId,
    });

    expect(retry.messageId).toBe(first.messageId);
    expect(await prisma.message.count({ where: { roomId, clientMessageId } })).toBe(1);
  });
});
