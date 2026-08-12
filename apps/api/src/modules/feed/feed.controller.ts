import { Controller, Get, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { feedQuerySchema, type FeedQueryDto } from '../posts/posts.dto.js';
import { FeedService, type FeedPage } from './feed.service.js';

@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('feed')
  async load(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(feedQuerySchema)) query: FeedQueryDto,
  ): Promise<FeedPage> {
    return this.feed.load(user.userId, query);
  }

  @Get('explore')
  async explore() {
    return this.feed.explore();
  }
}
