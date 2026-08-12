import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { Redis } from 'ioredis';

import { ENV } from '../config/env.config.js';

export const REDIS = Symbol('CURHAT_REDIS');

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: ServerEnv): Redis =>
        new Redis(env.REDIS_URL, {
          maxRetriesPerRequest: 2,
          // Fail fast rather than queueing writes while Redis is down. Rate
          // limiting must know it cannot count, not silently buffer.
          enableOfflineQueue: false,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
