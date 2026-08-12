import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { APP_CONFIG_DEFAULTS, type AppConfigKey, type PrismaClient } from '@curhat/database';

import { PRISMA } from './prisma.service.js';

/**
 * Runtime configuration from `app_configs` — PRD §25.7.
 *
 * Values are tuned from the admin panel without a deploy, so nothing that can
 * change should be a constant in code. Reads are cached briefly: config is
 * consulted on hot paths like rate limiting, and a database round trip per
 * request would be wasteful, but an operator changing a limit should not have
 * to wait long to see it take effect.
 */
@Injectable()
export class AppConfigService {
  private static readonly CACHE_TTL_MS = 30_000;

  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async getNumber(key: AppConfigKey): Promise<number> {
    const value = await this.get(key);
    return typeof value === 'number' ? value : APP_CONFIG_DEFAULTS[key];
  }

  /**
   * Reads a JSON-valued row (routing table, model prices).
   *
   * Untyped by design: the shape belongs to the module that owns the key, and
   * each of those validates what it reads rather than trusting the row.
   */
  async getJson<T>(key: string, fallback: T): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return (cached.value as T) ?? fallback;

    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    const value = row?.value ?? null;

    this.cache.set(key, { value, expiresAt: Date.now() + AppConfigService.CACHE_TTL_MS });
    return (value as T | null) ?? fallback;
  }

  private async get(key: AppConfigKey): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    // Falling back to the seeded default means a missing row degrades to the
    // documented value rather than to undefined.
    const value = row?.value ?? APP_CONFIG_DEFAULTS[key];

    this.cache.set(key, { value, expiresAt: Date.now() + AppConfigService.CACHE_TTL_MS });
    return value;
  }

  /** Test seam and admin-write hook. */
  invalidate(): void {
    this.cache.clear();
  }
}

@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
