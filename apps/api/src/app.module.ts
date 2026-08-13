import { Module } from '@nestjs/common';

import { AppConfigModule } from './common/app-config.service.js';
import { PrismaModule } from './common/prisma.service.js';
import { RedisModule } from './common/redis.service.js';
import { EnvModule } from './config/env.config.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';
import { FeedModule } from './modules/feed/feed.module.js';
import { FeltHeardModule } from './modules/felt-heard/felt-heard.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ListenerModule } from './modules/listener/listener.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { ReactionsModule } from './modules/reactions/reactions.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WorkerModule } from './worker/worker.module.js';

/**
 * Modular monolith (TECH-SPEC §1.4). One deployable, domain-separated modules.
 *
 * The worker runs from this same codebase in a separate container; it boots a
 * different root module and shares everything below the module boundary.
 */
@Module({
  imports: [
    EnvModule,
    PrismaModule,
    RedisModule,
    AppConfigModule,
    HealthModule,

    AuthModule,
    UsersModule,
    ProfilesModule,
    PostsModule,
    FeedModule,
    CommentsModule,
    ReactionsModule,
    FeltHeardModule,
    AiModule,
    ListenerModule,
    ChatModule,
    SafetyModule,
    ModerationModule,
    NotificationsModule,
    SearchModule,
    AdminModule,
    AnalyticsModule,
    FeatureFlagsModule,
    WorkerModule,
  ],
})
export class AppModule {}
