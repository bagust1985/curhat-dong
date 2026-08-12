import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerEnv } from '@curhat/config/env/server';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

import { ENV } from '../config/env.config.js';

/**
 * Socket.IO with a Redis backplane — E11-T01, TECH-SPEC §1.1, §3.5.
 *
 * The adapter is installed when the server is *created*, not swapped in
 * afterwards from a gateway's `afterInit`. Swapping late leaves sockets that
 * connected in the meantime registered with the previous adapter while
 * broadcasts go through the new one — which shows up as rooms that
 * intermittently stop delivering, and is miserable to diagnose.
 *
 * MVP runs a single node. Wiring this now means a second container is a
 * deployment change rather than a debugging session.
 */
export class RedisIoAdapter extends IoAdapter {
  private static readonly logger = new Logger(RedisIoAdapter.name);

  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private readonly clients: Redis[] = [];

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connect(): Promise<void> {
    const env = this.app.get<ServerEnv>(ENV);

    // Its own connections rather than duplicates of the request-path client:
    // that one is configured to fail fast so rate limiting knows when it
    // cannot count, and a pub/sub link with those settings drops commands
    // issued before it finishes connecting.
    const pub = new Redis(env.REDIS_URL);
    const sub = new Redis(env.REDIS_URL);
    this.clients.push(pub, sub);

    await Promise.all([waitForReady(pub), waitForReady(sub)]);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  /** Called by Nest on shutdown; the backplane's own connections close here. */
  override async close(server: Server): Promise<void> {
    await super.close(server);
    for (const client of this.clients) client.disconnect();
    this.clients.length = 0;
  }

  /** Falls back to the in-memory adapter rather than refusing to boot. */
  static async create(app: INestApplicationContext): Promise<RedisIoAdapter> {
    const adapter = new RedisIoAdapter(app);

    try {
      await adapter.connect();
    } catch (error) {
      RedisIoAdapter.logger.error(
        'Socket.IO Redis backplane unavailable; running single-node',
        error,
      );
    }

    return adapter;
  }
}

function waitForReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis connection timed out')), 5_000);
    client.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
    client.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
