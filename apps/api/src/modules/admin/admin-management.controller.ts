import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { UserStatus } from '@curhat/database';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  AdminGuard,
  CurrentAdmin,
  RequirePermission,
  type AdminContext,
} from './admin.guard.js';
import {
  categoryArchiveSchema,
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  commentLockSchema,
  contentQuerySchema,
  contentReasonSchema,
  listenerActionSchema,
  listenerQuerySchema,
  userActionSchema,
  userSearchSchema,
  type CategoryArchiveDto,
  type CategoryCreateDto,
  type CategoryReorderDto,
  type CategoryUpdateDto,
  type CommentLockDto,
  type ContentQueryDto,
  type ContentReasonDto,
  type ListenerActionDto,
  type ListenerQueryDto,
  type UserActionDto,
  type UserSearchDto,
} from './admin.dto.js';
import { CategoryAdminService, type CategoryAdminView } from './category-admin.service.js';
import { ContentAdminService, type PostAdminPage } from './content-admin.service.js';
import { ListenerAdminService, type ListenerSummary } from './listener-admin.service.js';
import { UserAdminService, type UserDetail, type UserSummary } from './user-admin.service.js';

/**
 * User, content, listener and category management — E14-T08 to T11.
 * PRD §16, §18; DESIGN-REF §3.4 to §3.7.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminManagementController {
  constructor(
    private readonly users: UserAdminService,
    private readonly content: ContentAdminService,
    private readonly listeners: ListenerAdminService,
    private readonly categories: CategoryAdminService,
  ) {}

  // --- Users (E14-T08) -----------------------------------------------------

  @Get('users')
  @RequirePermission('user.read')
  async searchUsers(
    @Query(new ZodValidationPipe(userSearchSchema)) query: UserSearchDto,
  ): Promise<UserSummary[]> {
    return this.users.search(query);
  }

  @Get('users/:id')
  @RequirePermission('user.read')
  async userDetail(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ): Promise<UserDetail> {
    return this.users.detail(id, admin.userId);
  }

  /** Step-up permission: acting on an account is not a read. */
  @Post('users/:id/actions')
  @RequirePermission('user.action.apply')
  async actOnUser(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userActionSchema)) body: UserActionDto,
  ): Promise<{ status: UserStatus }> {
    return this.users.act({
      userId: id,
      adminId: admin.userId,
      action: body.action,
      reason: body.reason,
      ...(body.durationHours !== undefined ? { durationHours: body.durationHours } : {}),
    });
  }

  // --- Content (E14-T09) ---------------------------------------------------

  @Get('content/posts')
  @RequirePermission('content.read')
  async listPosts(
    @Query(new ZodValidationPipe(contentQuerySchema)) query: ContentQueryDto,
  ): Promise<PostAdminPage> {
    return this.content.list(query);
  }

  @Post('content/posts/:id/remove')
  @RequirePermission('content.moderate')
  async removePost(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(contentReasonSchema)) body: ContentReasonDto,
  ): Promise<{ status: string }> {
    return this.content.remove(id, admin.userId, body.reason);
  }

  @Post('content/posts/:id/restore')
  @RequirePermission('content.moderate')
  async restorePost(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(contentReasonSchema)) body: ContentReasonDto,
  ): Promise<{ status: string }> {
    return this.content.restore(id, admin.userId, body.reason);
  }

  /** Locks or unlocks a thread. Existing comments are never deleted. */
  @Patch('content/posts/:id/comments')
  @RequirePermission('content.moderate')
  async setComments(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(commentLockSchema)) body: CommentLockDto,
  ): Promise<{ allowComments: boolean; commentsKept: number }> {
    return this.content.setComments(id, admin.userId, body.allowComments, body.reason);
  }

  // --- Listeners (E14-T10) -------------------------------------------------

  @Get('listeners')
  @RequirePermission('listener.read')
  async listListeners(
    @Query(new ZodValidationPipe(listenerQuerySchema)) query: ListenerQueryDto,
  ): Promise<ListenerSummary[]> {
    return this.listeners.list(query);
  }

  /**
   * Suspends, restores, or flags a listener for review.
   *
   * None of these touch the user's account. Somebody who has absorbed too much
   * is not somebody to remove from a product about not being alone.
   */
  @Post('listeners/:id/actions')
  @RequirePermission('listener.suspend')
  async actOnListener(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(listenerActionSchema)) body: ListenerActionDto,
  ): Promise<{ safetyStatus: string; sessionsClosed?: number }> {
    const input = { userId: id, adminId: admin.userId, reason: body.reason };

    if (body.action === 'suspend') return this.listeners.suspendListenerMode(input);
    if (body.action === 'restore') return this.listeners.restoreListenerMode(input);
    return this.listeners.markUnderReview(input);
  }

  // --- Categories (E14-T11) ------------------------------------------------

  @Get('categories')
  @RequirePermission('category.manage')
  async listCategories(): Promise<CategoryAdminView[]> {
    return this.categories.list();
  }

  @Post('categories')
  @RequirePermission('category.manage')
  async createCategory(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(categoryCreateSchema)) body: CategoryCreateDto,
  ): Promise<CategoryAdminView> {
    return this.categories.create({ adminId: admin.userId, ...body });
  }

  /** Name, icon and order. The slug is not editable — see the DTO. */
  @Patch('categories/:id')
  @RequirePermission('category.manage')
  async updateCategory(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryUpdateSchema)) body: CategoryUpdateDto,
  ): Promise<CategoryAdminView> {
    return this.categories.update({ adminId: admin.userId, id, ...body });
  }

  @Post('categories/reorder')
  @RequirePermission('category.manage')
  async reorderCategories(
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodValidationPipe(categoryReorderSchema)) body: CategoryReorderDto,
  ): Promise<CategoryAdminView[]> {
    return this.categories.reorder({ adminId: admin.userId, order: body.order });
  }

  /** Archive or restore. There is no delete — posts keep their category. */
  @Patch('categories/:id/active')
  @RequirePermission('category.manage')
  async archiveCategory(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryArchiveSchema)) body: CategoryArchiveDto,
  ): Promise<CategoryAdminView> {
    return this.categories.setActive({ adminId: admin.userId, id, isActive: body.isActive });
  }
}
