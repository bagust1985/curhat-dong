import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { hashIp } from '@curhat/auth';
import type { ServerEnv } from '@curhat/config/env/server';
import { Inject } from '@nestjs/common';
import type { Request, Response } from 'express';

import { clientIpOf } from '../../common/client-ip.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ENV } from '../../config/env.config.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import {
  AdminAuthService,
  type AdminLoginResult,
  type MfaEnrolment,
} from './admin-auth.service.js';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
  type AdminContext,
} from './admin.guard.js';
import {
  auditQuerySchema,
  mfaCodeSchema,
  privateContentSchema,
  type AuditQueryDto,
  type MfaCodeDto,
  type PrivateContentDto,
} from './admin.dto.js';
import { AuditService, type AuditPage } from './audit.service.js';
import { permissionsFor, type AdminPermission } from './permissions.js';
import { PrivateContentService, type PrivateRoomView } from './private-content.service.js';

/**
 * Admin API — E14-T01 to T04. TECH-SPEC §3.6.
 *
 * Every route below either carries `@RequirePermission` — and is therefore
 * checked by `AdminGuard` — or is part of the MFA handshake itself, which
 * cannot require MFA without being unreachable.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly adminAuth: AdminAuthService,
    private readonly audit: AuditService,
    private readonly privateContent: PrivateContentService,
  ) {}

  // --- MFA handshake -------------------------------------------------------
  //
  // These four run on an ordinary authenticated session. They are the only
  // admin routes that do, because requiring an MFA-verified session to set up
  // MFA is a locked door with the key inside.

  @Post('auth/mfa/enrol')
  async beginEnrolment(@CurrentUser() user: AuthenticatedUser): Promise<MfaEnrolment> {
    return this.adminAuth.beginEnrolment(user.userId);
  }

  @Post('auth/mfa/confirm')
  async confirmEnrolment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: MfaCodeDto,
  ): Promise<{ enabled: true }> {
    return this.adminAuth.confirmEnrolment(user.userId, body.code);
  }

  /**
   * Second factor, exchanged for an admin session.
   *
   * The first factor is the ordinary email OTP every account uses — there are
   * no passwords in this product — so this is a genuine second factor:
   * something emailed, then something held.
   */
  @Post('auth/login')
  async login(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: MfaCodeDto,
    @Req() request: Request,
  ): Promise<AdminLoginResult> {
    return this.adminAuth.login(user.userId, body.code, {
      ipHash: this.ipHash(request),
      userAgent: request.headers['user-agent'],
    });
  }

  /** Step-up before a sensitive action (E14-T01). */
  @Post('auth/reauth')
  async reauth(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mfaCodeSchema)) body: MfaCodeDto,
  ): Promise<{ verifiedAt: Date }> {
    return this.adminAuth.stepUp(user.userId, user.sessionId, body.code);
  }

  // --- Session -------------------------------------------------------------

  /**
   * What this admin may do, for the panel to render with.
   *
   * Advisory only. The menu is a courtesy; `AdminGuard` is the control
   * (E14-T02) — a panel that hid nothing would still be safe.
   */
  @Get('me')
  @RequirePermission('analytics.read')
  me(@CurrentAdmin() admin: AdminContext): {
    role: string;
    permissions: readonly AdminPermission[];
  } {
    return { role: admin.role, permissions: permissionsFor(admin.role) };
  }

  // --- Audit (E14-T03) -----------------------------------------------------

  @Get('audit')
  @RequirePermission('audit.read')
  async listAudit(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryDto,
  ): Promise<AuditPage> {
    return this.audit.list(query);
  }

  /**
   * CSV export, written to the response directly.
   *
   * `@Res()` rather than a returned string, for the same reason E09's SSE
   * stream does it: the global `ResponseInterceptor` wraps every returned value
   * in `{data, meta, error}`, and a CSV file whose first line is JSON is not a
   * CSV file. Setting the content type is not enough — the body has to skip the
   * envelope, and taking the response object is what does that.
   */
  @Get('audit/export')
  @RequirePermission('audit.read')
  async exportAudit(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.audit.exportCsv(query);

    response
      .status(200)
      .setHeader('content-type', 'text/csv; charset=utf-8')
      .setHeader('content-disposition', 'attachment; filename="audit-log.csv"')
      // An export of the audit log is itself worth marking as never cacheable.
      .setHeader('cache-control', 'no-store')
      .send(csv);
  }

  // --- Private content (E14-T04) -------------------------------------------

  /**
   * The notice shown before content opens — never after.
   *
   * A separate call so the panel has to fetch and display it before it can
   * request the content, rather than rendering a warning next to text the
   * moderator has already read.
   */
  @Get('private-content/notice')
  @RequirePermission('content.private.read')
  notice(): { notice: string } {
    return this.privateContent.notice();
  }

  @Post('private-content/open')
  @RequirePermission('content.private.read')
  async openPrivateContent(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(privateContentSchema)) body: PrivateContentDto,
    @Req() request: Request,
  ): Promise<PrivateRoomView> {
    return this.privateContent.openRoom({
      adminId: admin.userId,
      caseId: body.caseId,
      targetType: body.targetType,
      targetId: body.targetId,
      ipHash: this.ipHash(request),
    });
  }

  private ipHash(request: Request): string | undefined {
    const ip = clientIpOf(request);
    return ip ? hashIp(ip, this.env.TOKEN_ENCRYPTION_KEY) : undefined;
  }
}
