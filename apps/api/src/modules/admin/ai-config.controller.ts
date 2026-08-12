import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { PromptKey } from '@curhat/ai';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
  type AdminContext,
} from './admin.guard.js';
import {
  configReasonSchema,
  promptDiffSchema,
  promptPublishSchema,
  promptRollbackSchema,
  routingUpdateSchema,
  thresholdUpdateSchema,
  type ConfigReasonDto,
  type PromptDiffDto,
  type PromptPublishDto,
  type PromptRollbackDto,
  type RoutingUpdateDto,
  type ThresholdUpdateDto,
} from './admin.dto.js';
import {
  AiConfigService,
  type RoutingView,
  type ThresholdView,
} from './ai-config.service.js';

/**
 * AI moderation configuration — E14-T12. PRD §18, TECH-SPEC §4.4,
 * DESIGN-REF §3.8.
 *
 * Every route is Super Admin only, by way of `ai_config.read` / `ai_config.write`
 * — permissions no other role holds (E14-T02). `ai_config.write` is also a
 * step-up permission: changing what the safety engine holds back is not
 * something an unattended laptop should be able to do.
 *
 * There is deliberately no route that switches classification off. Not hidden,
 * not permission-gated — absent.
 */
@Controller('admin/ai-config')
@UseGuards(AdminGuard)
export class AiConfigController {
  constructor(private readonly config: AiConfigService) {}

  @Get('thresholds')
  @RequirePermission('ai_config.read')
  async thresholds(): Promise<ThresholdView> {
    return this.config.thresholds();
  }

  @Patch('thresholds')
  @RequirePermission('ai_config.write')
  async updateThresholds(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(thresholdUpdateSchema)) body: ThresholdUpdateDto,
  ): Promise<ThresholdView> {
    return this.config.updateThresholds({
      adminId: admin.userId,
      thresholds: body.thresholds,
      reason: body.reason,
    });
  }

  @Post('thresholds/reset')
  @RequirePermission('ai_config.write')
  async resetThresholds(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(configReasonSchema)) body: ConfigReasonDto,
  ): Promise<ThresholdView> {
    return this.config.resetThresholds({ adminId: admin.userId, reason: body.reason });
  }

  @Get('routing')
  @RequirePermission('ai_config.read')
  async routing(): Promise<RoutingView> {
    return this.config.routing();
  }

  @Patch('routing')
  @RequirePermission('ai_config.write')
  async updateRouting(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(routingUpdateSchema)) body: RoutingUpdateDto,
  ): Promise<RoutingView> {
    return this.config.updateRouting({
      adminId: admin.userId,
      routing: body.routing as Record<string, unknown>,
      reason: body.reason,
    });
  }

  @Get('prompts/:key/history')
  @RequirePermission('ai_config.read')
  async promptHistory(@Param('key') key: string) {
    return this.config.promptHistory(key as PromptKey);
  }

  /** Line diff between two revisions of the same prompt. */
  @Get('prompts/:key/diff')
  @RequirePermission('ai_config.read')
  async promptDiff(
    @Param('key') key: string,
    @Query(new ZodValidationPipe(promptDiffSchema)) query: PromptDiffDto,
  ) {
    return this.config.promptDiff(key as PromptKey, query.from, query.to);
  }

  @Post('prompts/:key/publish')
  @RequirePermission('ai_config.write')
  async publishPrompt(
    @CurrentAdmin() admin: AdminContext,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(promptPublishSchema)) body: PromptPublishDto,
  ): Promise<{ version: number }> {
    return this.config.publishPrompt({
      adminId: admin.userId,
      key: key as PromptKey,
      template: body.template,
      changeNote: body.changeNote,
    });
  }

  /** Moves the active pointer back. No deploy, no data lost (E08-T04). */
  @Post('prompts/:key/rollback')
  @RequirePermission('ai_config.write')
  async rollbackPrompt(
    @CurrentAdmin() admin: AdminContext,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(promptRollbackSchema)) body: PromptRollbackDto,
  ): Promise<{ version: number }> {
    return this.config.rollbackPrompt({
      adminId: admin.userId,
      key: key as PromptKey,
      version: body.version,
      reason: body.reason,
    });
  }
}
