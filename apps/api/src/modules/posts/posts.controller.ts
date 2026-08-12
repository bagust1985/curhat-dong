import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { CategoriesService, type CategoryView } from './categories.service.js';
import {
  createPostSchema,
  updatePostSchema,
  type CreatePostDto,
  type UpdatePostDto,
} from './posts.dto.js';
import { PostsService, type CreatePostResult, type PostView } from './posts.service.js';

@Controller()
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly categories: CategoriesService,
  ) {}

  @Get('categories')
  async listCategories(): Promise<CategoryView[]> {
    return this.categories.listActive();
  }

  @Post('posts')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostDto,
  ): Promise<CreatePostResult> {
    return this.posts.create(user.userId, body);
  }

  @Get('posts/:id')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<PostView> {
    return this.posts.findById(id, user.userId);
  }

  @Delete('posts/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'deleted' }> {
    await this.posts.deleteOwn(id, user.userId);
    return { status: 'deleted' };
  }

  @Patch('posts/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostDto,
  ): Promise<{ status: 'updated' }> {
    if (body.allowComments !== undefined) {
      await this.posts.setAllowComments(id, user.userId, body.allowComments);
    }
    return { status: 'updated' };
  }
}
