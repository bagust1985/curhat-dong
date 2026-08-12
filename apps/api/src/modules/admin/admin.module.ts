import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AuditService } from './audit.service.js';
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
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    AuditService,
    PrivateContentService,
    AdminGuard,
  ],
  exports: [AuditService, AdminAuthService, PrivateContentService],
})
export class AdminModule {}
