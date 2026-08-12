import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { ListenerModule } from '../listener/listener.module.js';
import { AiModule } from '../ai/ai.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminManagementController } from './admin-management.controller.js';
import { AdminModerationController } from './admin-moderation.controller.js';
import { AiConfigController } from './ai-config.controller.js';
import { AiConfigService } from './ai-config.service.js';
import { AppealReviewService } from './appeal-review.service.js';
import { CategoryAdminService } from './category-admin.service.js';
import { ContentAdminService } from './content-admin.service.js';
import { ListenerAdminService } from './listener-admin.service.js';
import { UserAdminService } from './user-admin.service.js';
import { AuditService } from './audit.service.js';
import { CaseDetailService } from './case-detail.service.js';
import { ModerationQueueService } from './moderation-queue.service.js';
import { PrivateContentService } from './private-content.service.js';

/**
 * Admin panel API — E14. PRD §18; TECH-SPEC §3.6, §7.4, BAGIAN 18–19.
 *
 * `AdminGuard` is attached per controller with `@UseGuards`, not registered as
 * an `APP_GUARD`. Ordering is the reason: `NestFactory.create` registers module
 * guards before `main.ts` calls `useGlobalGuards`, so a global `AdminGuard`
 * would run *before* `JwtAuthGuard` and find no authenticated user — every
 * admin route would answer 401 with a perfectly valid token.
 *
 * Controller guards run after global ones, so the order is guaranteed. The
 * risk that someone forgets the decorator on a new admin controller is covered
 * by `admin-boundary.test.ts`, which fails CI instead.
 */
@Module({
  imports: [
    AuthModule,
    ModerationModule,
    NotificationsModule,
    ListenerModule,
    ChatModule,
    PostsModule,
    AiModule,
    SafetyModule,
  ],
  controllers: [
    AdminController,
    AdminModerationController,
    AdminManagementController,
    AiConfigController,
  ],
  providers: [
    AdminAuthService,
    AuditService,
    PrivateContentService,
    ModerationQueueService,
    CaseDetailService,
    AppealReviewService,
    UserAdminService,
    ContentAdminService,
    ListenerAdminService,
    CategoryAdminService,
    AiConfigService,
    AdminGuard,
  ],
  exports: [AuditService, AdminAuthService, PrivateContentService],
})
export class AdminModule {}
