import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { ApiException } from '../../common/api-error.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { updateProfileSchema, type UpdateProfileDto } from '../auth/auth.dto.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { UsersService, type OwnProfile, type PublicProfile } from './users.service.js';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<OwnProfile> {
    const profile = await this.users.getOwnProfile(user.userId);

    if (!profile) {
      // Authenticated but not yet onboarded — the client routes to E04.
      throw ApiException.notFound('NOT_FOUND', 'Kamu belum selesai onboarding.');
    }

    return profile;
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileDto,
  ): Promise<OwnProfile> {
    return this.users.updateOwnProfile(user.userId, body);
  }

  @Get('users/:alias')
  async publicProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alias') alias: string,
  ): Promise<PublicProfile> {
    return this.users.getPublicProfile(alias, user.userId);
  }

  @Post('users/:alias/block')
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alias') alias: string,
  ): Promise<{ status: 'blocked' }> {
    await this.users.block(user.userId, alias);
    return { status: 'blocked' };
  }

  @Delete('users/:alias/block')
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alias') alias: string,
  ): Promise<{ status: 'unblocked' }> {
    await this.users.unblock(user.userId, alias);
    return { status: 'unblocked' };
  }

  @Get('me/blocked')
  async blocked(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Array<{ alias: string; blockedAt: Date }>> {
    return this.users.listBlocked(user.userId);
  }
}
