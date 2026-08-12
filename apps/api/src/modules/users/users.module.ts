import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Account lifecycle, public profile and block (E03-T10, E03-T11).
 *
 * UsersService is exported because feed, comments and listener matching all
 * need the block filter — the two-way rule must be applied identically
 * everywhere (PRD §15), not reimplemented per module.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
