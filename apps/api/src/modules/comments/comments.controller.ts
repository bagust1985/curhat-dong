import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { ReactionsService, type ReactionSummary } from '../reactions/reactions.service.js';
import { CommentsService, type CommentPage, type CommentView } from './comments.service.js';
import {
  commentQuerySchema,
  createCommentSchema,
  markHelpfulSchema,
  reactionSchema,
  type CommentQueryDto,
  type CreateCommentDto,
  type MarkHelpfulDto,
  type ReactionDto,
} from './comments.dto.js';

@Controller()
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly reactions: ReactionsService,
  ) {}

  @Get('posts/:postId/comments')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Query(new ZodValidationPipe(commentQuerySchema)) query: CommentQueryDto,
  ): Promise<CommentPage> {
    return this.comments.list(user.userId, postId, query.cursor, query.limit);
  }

  @Post('posts/:postId/comments')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('postId') postId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: CreateCommentDto,
  ): Promise<CommentView> {
    return this.comments.create(user.userId, postId, body.body, body.parentId);
  }

  @Delete('comments/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'deleted' }> {
    await this.comments.deleteOwn(user.userId, id);
    return { status: 'deleted' };
  }

  @Post('comments/:id/helpful')
  async markHelpful(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markHelpfulSchema)) body: MarkHelpfulDto,
  ): Promise<{ status: 'ok' }> {
    await this.comments.markHelpful(user.userId, id, body.helpful);
    return { status: 'ok' };
  }

  @Post('comments/:id/reactions')
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reactionSchema)) body: ReactionDto,
  ): Promise<ReactionSummary> {
    return this.reactions.set(user.userId, 'comment', id, body.type);
  }

  @Delete('comments/:id/reactions/:type')
  async unreact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('type') type: string,
  ): Promise<ReactionSummary> {
    const parsed = reactionSchema.parse({ type });
    return this.reactions.unset(user.userId, 'comment', id, parsed.type);
  }
}
