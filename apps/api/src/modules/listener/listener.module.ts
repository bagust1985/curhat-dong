import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { UsersModule } from '../users/users.module.js';
import { AvailabilityService } from './availability.service.js';
import { BurnoutService } from './burnout.service.js';
import { ListenerController } from './listener.controller.js';
import { ListenerEscalateService } from './listener-escalate.service.js';
import { ListenerRequestsService } from './listener-requests.service.js';
import { ListenerService } from './listener.service.js';
import { MatchingService } from './matching.service.js';
import { OffersService } from './offers.service.js';

/**
 * Listener activation, matching and burnout protection — E10. PRD §11;
 * TECH-SPEC §4.5, §4.7.
 *
 * The private room this module opens on `accept` is furnished in E11: realtime
 * messaging, presence, close and feedback. What lands here is everything that
 * decides *who* ends up in it.
 */
@Module({
  imports: [AuthModule, UsersModule, ModerationModule, SafetyModule],
  controllers: [ListenerController],
  providers: [
    AvailabilityService,
    BurnoutService,
    ListenerService,
    MatchingService,
    OffersService,
    ListenerRequestsService,
    ListenerEscalateService,
  ],
  exports: [
    AvailabilityService,
    BurnoutService,
    ListenerService,
    OffersService,
    ListenerRequestsService,
  ],
})
export class ListenerModule {}
