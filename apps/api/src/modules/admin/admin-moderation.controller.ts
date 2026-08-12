import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
  type AdminContext,
} from './admin.guard.js';
import {
  appealDecisionSchema,
  applyActionSchema,
  bulkActionSchema,
  queueQuerySchema,
  type AppealDecisionDto,
  type ApplyActionDto,
  type BulkActionDto,
  type QueueQueryDto,
} from './admin.dto.js';
import {
  AppealReviewService,
  type AppealDetail,
  type OverturnRateRow,
} from './appeal-review.service.js';
import { CaseDetailService, type CaseDetail } from './case-detail.service.js';
import {
  ModerationQueueService,
  type QueueCounts,
  type QueuePage,
} from './moderation-queue.service.js';

/**
 * Moderation queue, case actions and appeal review — E14-T05 to T07.
 * PRD §15.3, §15.4; DESIGN-REF §3.3, §3.13.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminModerationController {
  constructor(
    private readonly queue: ModerationQueueService,
    private readonly cases: CaseDetailService,
    private readonly appeals: AppealReviewService,
  ) {}

  // --- Queue (E14-T05) -----------------------------------------------------

  @Get('moderation/queue')
  @RequirePermission('moderation.queue.read')
  async listQueue(
    @Query(new ZodValidationPipe(queueQuerySchema)) query: QueueQueryDto,
  ): Promise<QueuePage> {
    return this.queue.list(query);
  }

  /** Sidebar badges. Critical burns red when non-zero (DESIGN-REF §3.3). */
  @Get('moderation/counts')
  @RequirePermission('moderation.queue.read')
  async counts(): Promise<QueueCounts> {
    return this.queue.counts();
  }

  // --- Case detail and actions (E14-T06) -----------------------------------

  @Get('moderation/cases/:id')
  @RequirePermission('moderation.case.read')
  async caseDetail(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ): Promise<CaseDetail> {
    return this.cases.detail(id, admin.userId);
  }

  /** Claims a case so two moderators do not work the same one. */
  @Post('moderation/cases/:id/assign')
  @RequirePermission('moderation.case.read')
  async assign(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ): Promise<{ assignedTo: string }> {
    return this.queue.assign(id, admin.userId);
  }

  /**
   * One of the seven actions.
   *
   * Behind `user.action.apply`, which is a step-up permission (E14-T01): a ban
   * is not something an unattended laptop should be able to do.
   */
  @Post('moderation/cases/:id/actions')
  @RequirePermission('user.action.apply')
  async applyAction(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applyActionSchema)) body: ApplyActionDto,
  ): Promise<{ actionId: string; appealable: boolean }> {
    return this.cases.apply({
      caseId: id,
      moderatorId: admin.userId,
      action: body.action,
      reason: body.reason,
      ...(body.durationHours !== undefined ? { durationHours: body.durationHours } : {}),
    });
  }

  /** Bulk clear — Low queue only, enforced in the service (E14-T06). */
  @Post('moderation/cases/bulk')
  @RequirePermission('moderation.action.bulk')
  async applyBulk(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(bulkActionSchema)) body: BulkActionDto,
  ): Promise<{ applied: number; skipped: Array<{ caseId: string; reason: string }> }> {
    return this.cases.applyBulk({
      caseIds: body.caseIds,
      moderatorId: admin.userId,
      action: body.action,
      reason: body.reason,
    });
  }

  // --- Appeals (E14-T07) ---------------------------------------------------

  /**
   * The reviewer's queue, with their own decisions filtered out by the query.
   *
   * Hidden rather than refused: the first two layers of the fairness rule
   * (a database CHECK and a service refusal) produce an error at the end of the
   * work. Hiding means the moderator never opens it and never forms a view they
   * then have to set aside.
   */
  @Get('appeals')
  @RequirePermission('appeal.read')
  async appealQueue(@CurrentAdmin() admin: AdminContext) {
    return this.appeals.queue(admin.userId, admin.role);
  }

  /** Appeals stranded because the deciding moderator is the only moderator. */
  @Get('appeals/needs-super-admin')
  @RequirePermission('appeal.read')
  async needingSuperAdmin(): Promise<{ appealIds: string[] }> {
    return { appealIds: await this.appeals.needingSuperAdmin() };
  }

  /**
   * Overturn rate per action, each linked to the threshold behind it.
   *
   * A category overturned often means the threshold is wrong, not that users
   * are wrong (PRD §15.4).
   */
  @Get('appeals/overturn-rates')
  @RequirePermission('appeal.read')
  async overturnRates(): Promise<OverturnRateRow[]> {
    return this.appeals.overturnRates();
  }

  @Get('appeals/:id')
  @RequirePermission('appeal.read')
  async appealDetail(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ): Promise<AppealDetail> {
    return this.appeals.detail(id, admin.userId);
  }

  @Post('appeals/:id/decision')
  @RequirePermission('appeal.decide')
  async decideAppeal(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(appealDecisionSchema)) body: AppealDecisionDto,
  ): Promise<{ status: string }> {
    return this.appeals.decide({
      appealId: id,
      reviewerId: admin.userId,
      status: body.status,
      note: body.note,
      ...(body.reducedDurationHours !== undefined
        ? { reducedDurationHours: body.reducedDurationHours }
        : {}),
    });
  }
}
