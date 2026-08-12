import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@curhat/database';
import type { AdminRole } from '@curhat/types';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import type { RequestWithUser } from '../auth/jwt-auth.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AuditService } from './audit.service.js';
import { can, isAdminRole, requiresReauth, type AdminPermission } from './permissions.js';

export const ADMIN_PERMISSION = 'curhat:adminPermission';

/**
 * Declares what a route needs. Absent means the route is not an admin route.
 */
export const RequirePermission = (permission: AdminPermission) =>
  SetMetadata(ADMIN_PERMISSION, permission);

export interface AdminContext {
  userId: string;
  sessionId: string;
  role: AdminRole;
}

/**
 * Admin authorisation — E14-T01, E14-T02.
 *
 * Runs after `JwtAuthGuard`, so identity is already established. Three
 * questions, in order, each of which can only narrow:
 *
 *  1. does this account still hold an admin role? Read from the database, not
 *     from the token — a role revoked five minutes ago must not keep working
 *     for the fifteen minutes the access token is valid;
 *  2. has this session satisfied MFA? Mandatory, never skippable
 *     (TECH-SPEC §7.4);
 *  3. for a sensitive permission, is the step-up still fresh?
 *
 * A refusal at step 2 or 3 is reported with a distinct code so the panel can
 * show the MFA prompt rather than a dead end.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly reflector: Reflector,
    private readonly adminAuth: AdminAuthService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<AdminPermission>(ADMIN_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Not an admin route.
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser & { admin?: AdminContext }>();
    const user = request.user;

    if (!user) {
      throw ApiException.unauthorized('UNAUTHORIZED', 'Kamu perlu masuk dulu.');
    }

    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { adminRole: true, status: true },
    });

    if (!account || !isAdminRole(account.adminRole) || account.status !== 'active') {
      // 404, not 403: the admin panel's existence is not something an ordinary
      // user's token should be able to confirm.
      throw ApiException.notFound('NOT_FOUND', 'Halaman tidak ditemukan.');
    }

    if (!can(account.adminRole, permission)) {
      // A role reaching for something it does not have is worth recording —
      // it is either a misconfigured panel or somebody trying doors.
      await this.audit.record({
        actorId: user.userId,
        action: 'admin.permission.denied',
        targetType: 'permission',
        targetId: permission,
        diff: { role: account.adminRole },
      });

      throw ApiException.forbidden('FORBIDDEN', 'Role kamu tidak punya akses ke sini.');
    }

    if (!(await this.adminAuth.isMfaSatisfied(user.sessionId))) {
      throw ApiException.forbidden(
        'ADMIN_MFA_REQUIRED',
        'Sesi ini belum lolos MFA. Masuk ulang lewat panel admin.',
      );
    }

    if (requiresReauth(permission) && !(await this.adminAuth.isReauthFresh(user.sessionId))) {
      throw ApiException.forbidden(
        'ADMIN_REAUTH_REQUIRED',
        'Aksi ini butuh konfirmasi MFA lagi.',
      );
    }

    request.admin = {
      userId: user.userId,
      sessionId: user.sessionId,
      role: account.adminRole,
    };

    return true;
  }
}

/** The resolved admin context, for a controller that needs the actor's role. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminContext => {
    const request = context.switchToHttp().getRequest<{ admin?: AdminContext }>();
    if (!request.admin) {
      // Only reachable if a controller forgot @RequirePermission — the guard
      // is what populates this.
      throw ApiException.forbidden('FORBIDDEN', 'Konteks admin tidak tersedia.');
    }
    return request.admin;
  },
);
