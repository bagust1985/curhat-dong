import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FeltHeardModule } from '../felt-heard/felt-heard.module.js';
import { ReactionsModule } from '../reactions/reactions.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { UsersModule } from '../users/users.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [AuthModule, UsersModule, SafetyModule, FeltHeardModule, ReactionsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
