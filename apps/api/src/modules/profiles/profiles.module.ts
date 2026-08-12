import { Module } from '@nestjs/common';

import { AliasService } from './alias.service.js';
import { AnonymousIdentityService } from './anonymous-identity.service.js';

/**
 * Public-safe profile and anonymous identity (E04-T03, E04-T04).
 *
 * Both services are exported: posts need the anonymous identity, onboarding
 * needs the alias generator.
 */
@Module({
  providers: [AliasService, AnonymousIdentityService],
  exports: [AliasService, AnonymousIdentityService],
})
export class ProfilesModule {}
