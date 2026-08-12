import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SafetyModule } from '../safety/safety.module.js';
import { UsersModule } from '../users/users.module.js';
import { CategoriesService } from './categories.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [AuthModule, ProfilesModule, SafetyModule, UsersModule],
  controllers: [PostsController],
  providers: [PostsService, CategoriesService],
  exports: [PostsService, CategoriesService],
})
export class PostsModule {}
