import { Global, Module } from '@nestjs/common';

import { FeatureFlagService } from './feature-flags.service.js';

/**
 * DB-backed runtime flags (E01, E14).
 *
 * Global: flags are consulted from anywhere, and threading an import through
 * every module that happens to guard one feature adds noise without adding
 * isolation.
 */
@Global()
@Module({
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
