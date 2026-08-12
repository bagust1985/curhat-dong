import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
