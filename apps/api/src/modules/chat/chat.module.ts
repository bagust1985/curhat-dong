import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FeltHeardModule } from '../felt-heard/felt-heard.module.js';
import { ListenerModule } from '../listener/listener.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { MessageSafetyService } from './message-safety.service.js';
import { PresenceService } from './presence.service.js';
import { RoomAccessService } from './room-access.service.js';
import { RoomEventsService } from './room-events.service.js';
import { RoomMessagesService } from './room-messages.service.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';
import { RtGateway } from './rt.gateway.js';

/**
 * Private Curhat Room — E11. PRD §11; TECH-SPEC §3.4, §3.5, §4.3.1, §8.3.
 *
 * The room E10 opens on `accept` gets its contents here: realtime messaging,
 * presence, per-event membership checks, asynchronous message safety, session
 * close and two-way feedback.
 *
 * Closing a session is also where the listener burnout counters advance
 * (E10-T09) — the caps E10 built are inert until this module calls them.
 */
@Module({
  imports: [
    AuthModule,
    AiModule,
    SafetyModule,
    ModerationModule,
    ListenerModule,
    FeltHeardModule,
    NotificationsModule,
  ],
  controllers: [RoomsController],
  providers: [
    RoomAccessService,
    RoomEventsService,
    RoomMessagesService,
    MessageSafetyService,
    PresenceService,
    RoomsService,
    RtGateway,
  ],
  exports: [RoomAccessService, RoomsService, RoomEventsService],
})
export class ChatModule {}
