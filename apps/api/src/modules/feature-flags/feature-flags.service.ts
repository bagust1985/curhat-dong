import { Inject, Injectable, Logger } from '@nestjs/common';
import { FEATURE_FLAG_DEFAULTS, type FeatureFlagKey, type PrismaClient } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';

/**
 * Runtime feature flags — E01, E14.
 *
 * Same shape as `AppConfigService`, different question: config tunes a number,
 * a flag decides whether a code path exists at all. Both are read briefly
 * cached, because a bad rollout has to be stoppable without a deploy.
 */
@Injectable()
export class FeatureFlagService {
  private static readonly CACHE_TTL_MS = 30_000;

  private readonly logger = new Logger(FeatureFlagService.name);
  private cache = new Map<string, { value: boolean; expiresAt: number }>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let value = FEATURE_FLAG_DEFAULTS[key];

    try {
      const row = await this.prisma.featureFlag.findUnique({ where: { key } });
      if (typeof row?.value === 'boolean') value = row.value;
    } catch (error) {
      // A missing row or an unreachable database degrades to the documented
      // default rather than to `undefined`, which reads as "off" everywhere.
      this.logger.error(`feature flag lookup failed for ${key}; using default`, error);
    }

    this.cache.set(key, { value, expiresAt: Date.now() + FeatureFlagService.CACHE_TTL_MS });
    return value;
  }

  /** Test and admin-write seam. */
  invalidate(): void {
    this.cache.clear();
  }
}
