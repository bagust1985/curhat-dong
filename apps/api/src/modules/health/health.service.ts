import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

import { ENV } from '../../config/env.config.js';

export interface DependencyStatus {
  name: string;
  ok: boolean;
  latencyMs: number;
}

export interface ReadinessReport {
  ready: boolean;
  dependencies: DependencyStatus[];
}

/**
 * Readiness checks the minimum set of dependencies needed to serve traffic
 * (TECH-SPEC §10.2). Liveness deliberately checks nothing — a live-but-not-ready
 * process should be pulled from the load balancer, not restarted.
 */
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly pool: Pool;
  private readonly redis: Redis;

  constructor(@Inject(ENV) env: ServerEnv) {
    this.pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async ready(): Promise<ReadinessReport> {
    const dependencies = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    return { ready: dependencies.every((d) => d.ok), dependencies };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    return this.timed('postgres', async () => {
      await this.pool.query('SELECT 1');
    });
  }

  private async checkRedis(): Promise<DependencyStatus> {
    return this.timed('redis', async () => {
      if (this.redis.status !== 'ready') await this.redis.connect();
      await this.redis.ping();
    });
  }

  private async timed(name: string, probe: () => Promise<void>): Promise<DependencyStatus> {
    const started = Date.now();
    try {
      await probe();
      return { name, ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      // Name the dependency, not the connection string — it holds credentials.
      this.logger.warn(`readiness probe failed: ${name}: ${(error as Error).message}`);
      return { name, ok: false, latencyMs: Date.now() - started };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end().catch(() => undefined);
    this.redis.disconnect();
  }
}
