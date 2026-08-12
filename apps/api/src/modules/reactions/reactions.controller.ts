import { Body, Controller, Delete, Param, Put } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { reactionSchema, type ReactionDto } from '../comments/comments.dto.js';
import { ReactionsService, type ReactionSummary } from './reactions.service.js';

@Controller()
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Put('posts/:id/reactions')
  async set(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reactionSchema)) body: ReactionDto,
  ): Promise<ReactionSummary> {
    return this.reactions.set(user.userId, 'post', id, body.type);
  }

  @Delete('posts/:id/reactions/:type')
  async unset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('type') type: string,
  ): Promise<ReactionSummary> {
    const parsed = reactionSchema.parse({ type });
    return this.reactions.unset(user.userId, 'post', id, parsed.type);
  }
}
