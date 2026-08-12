import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { SupportChannel } from '@curhat/database';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import type { SupportiveIntervention } from '../safety/support-resources.service.js';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
  type AdminContext,
} from './admin.guard.js';
import {
  analyticsComputeSchema,
  analyticsRangeSchema,
  broadcastCreateSchema,
  broadcastSegmentSchema,
  broadcastSendSchema,
  regionQuerySchema,
  supportResourceCreateSchema,
  supportResourceDeactivateSchema,
  supportResourceUpdateSchema,
  supportResourceVerifySchema,
  type AnalyticsComputeDto,
  type AnalyticsRangeDto,
  type BroadcastCreateDto,
  type BroadcastSegmentDto,
  type BroadcastSendDto,
  type RegionQueryDto,
  type SupportResourceCreateDto,
  type SupportResourceDeactivateDto,
  type SupportResourceUpdateDto,
  type SupportResourceVerifyDto,
} from './admin.dto.js';
import {
  AnalyticsService,
  type DashboardView,
  type FunnelStep,
  type RetentionRow,
} from './analytics.service.js';
import {
  BroadcastService,
  type BroadcastView,
  type RecipientEstimate,
} from './broadcast.service.js';
import {
  SupportResourcesAdminService,
  type SupportResourceAdminView,
  type SupportResourcesAdminList,
} from './support-resources-admin.service.js';

/**
 * Support resources, analytics and broadcasts — E14-T13 to T15.
 * PRD §15.2, §18, §19.1; DESIGN-REF §3.2, §3.9, §3.10, §3.14.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminPlatformController {
  constructor(
    private readonly supportResources: SupportResourcesAdminService,
    private readonly analytics: AnalyticsService,
    private readonly broadcasts: BroadcastService,
  ) {}

  // --- Support resources (E14-T13) -----------------------------------------

  @Get('support-resources')
  @RequirePermission('support_resources.manage')
  async listSupportResources(
    @Query(new ZodValidationPipe(regionQuerySchema)) query: RegionQueryDto,
  ): Promise<SupportResourcesAdminList> {
    return this.supportResources.list(query.region);
  }

  /**
   * The crisis screen, exactly as a user would see it.
   *
   * Built from `buildIntervention` — the same call the Level 3 screen makes, not
   * a mock-up of it. A preview assembled from different code would itself be the
   * mistake it exists to catch.
   */
  @Get('support-resources/preview')
  @RequirePermission('support_resources.manage')
  async previewSupportResources(
    @Query(new ZodValidationPipe(regionQuerySchema)) query: RegionQueryDto,
  ): Promise<SupportiveIntervention> {
    return this.supportResources.preview(query.region);
  }

  @Post('support-resources')
  @RequirePermission('support_resources.manage')
  async createSupportResource(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(supportResourceCreateSchema)) body: SupportResourceCreateDto,
  ): Promise<SupportResourceAdminView> {
    return this.supportResources.create({
      adminId: admin.userId,
      region: body.region,
      name: body.name,
      channel: body.channel as SupportChannel,
      value: body.value,
      hours: body.hours,
      language: body.language,
      sourceUrl: body.sourceUrl,
      isActive: body.isActive,
    });
  }

  @Patch('support-resources/:id')
  @RequirePermission('support_resources.manage')
  async updateSupportResource(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supportResourceUpdateSchema)) body: SupportResourceUpdateDto,
  ): Promise<SupportResourceAdminView> {
    return this.supportResources.update({ adminId: admin.userId, id, ...body });
  }

  /** Re-verification. Needs a fresh source, not just a click. */
  @Post('support-resources/:id/verify')
  @RequirePermission('support_resources.manage')
  async verifySupportResource(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supportResourceVerifySchema)) body: SupportResourceVerifyDto,
  ): Promise<SupportResourceAdminView> {
    return this.supportResources.verify({
      adminId: admin.userId,
      id,
      sourceUrl: body.sourceUrl,
    });
  }

  @Post('support-resources/:id/deactivate')
  @RequirePermission('support_resources.manage')
  async deactivateSupportResource(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supportResourceDeactivateSchema))
    body: SupportResourceDeactivateDto,
  ): Promise<SupportResourceAdminView> {
    return this.supportResources.deactivate({ adminId: admin.userId, id, reason: body.reason });
  }

  // --- Analytics (E14-T14) -------------------------------------------------

  @Get('analytics/dashboard')
  @RequirePermission('analytics.read')
  async dashboard(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeDto,
  ): Promise<DashboardView> {
    return this.analytics.dashboard(query.days);
  }

  @Get('analytics/funnel')
  @RequirePermission('analytics.read')
  async funnel(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeDto,
  ): Promise<FunnelStep[]> {
    return this.analytics.funnel(query.days);
  }

  @Get('analytics/retention')
  @RequirePermission('analytics.read')
  async retention(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeDto,
  ): Promise<RetentionRow[]> {
    return this.analytics.retention(Math.min(query.days, 60));
  }

  /**
   * Recomputes one day.
   *
   * Exposed so a backfill or a corrected metric definition can be replayed
   * without waiting for the nightly job. Idempotent — an upsert on the date —
   * so running it twice is harmless. Super Admin only, because a metric
   * recompute is a change to the numbers everyone else reads.
   */
  @Post('analytics/recompute')
  @RequirePermission('admin.manage')
  async recompute(
    @Body(new ZodValidationPipe(analyticsComputeSchema)) body: AnalyticsComputeDto,
  ): Promise<{ date: string }> {
    return this.analytics.computeDay(body.date ?? new Date());
  }

  // --- Broadcast (E14-T15) -------------------------------------------------

  @Get('broadcasts')
  @RequirePermission('notification.broadcast')
  async listBroadcasts(): Promise<BroadcastView[]> {
    return this.broadcasts.list();
  }

  /** Recipient count, fetched while composing so the number is never a surprise. */
  @Get('broadcasts/estimate')
  @RequirePermission('notification.broadcast')
  async estimateBroadcast(
    @Query(new ZodValidationPipe(broadcastSegmentSchema)) query: BroadcastSegmentDto,
  ): Promise<RecipientEstimate> {
    return this.broadcasts.estimate(query.segment);
  }

  @Post('broadcasts')
  @RequirePermission('notification.broadcast')
  async createBroadcast(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(broadcastCreateSchema)) body: BroadcastCreateDto,
  ): Promise<BroadcastView> {
    return this.broadcasts.create({
      adminId: admin.userId,
      type: body.type,
      segment: body.segment,
      title: body.title,
      body: body.body,
      ...(body.scheduledFor ? { scheduledFor: body.scheduledFor } : {}),
    });
  }

  /**
   * Sends, against a confirmed recipient count.
   *
   * The count is a required field rather than a flag: a broadcast cannot be
   * recalled, so it must be approved against a number the admin actually read.
   * A mismatch is refused and the snapshot refreshed.
   */
  @Post('broadcasts/:id/send')
  @RequirePermission('notification.broadcast')
  async sendBroadcast(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(broadcastSendSchema)) body: BroadcastSendDto,
  ): Promise<{ status: string; sentCount: number }> {
    return this.broadcasts.send({
      adminId: admin.userId,
      id,
      confirmedRecipients: body.confirmedRecipients,
    });
  }

  @Post('broadcasts/:id/cancel')
  @RequirePermission('notification.broadcast')
  async cancelBroadcast(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ): Promise<{ status: string }> {
    return this.broadcasts.cancel({ adminId: admin.userId, id });
  }
}
