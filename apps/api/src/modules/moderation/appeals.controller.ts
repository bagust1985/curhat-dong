import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { AppealsService } from './appeals.service.js';
import { ModerationService } from './moderation.service.js';
import { submitAppealSchema, type SubmitAppealDto } from './moderation.dto.js';

/**
 * User-facing appeals — PRD §15.4, DESIGN-REF §2.19.
 *
 * Without these routes a moderated user has no way to contest anything, and
 * every classifier mistake becomes permanent.
 */
@Controller()
export class AppealsController {
  constructor(
    private readonly appeals: AppealsService,
    private readonly moderation: ModerationService,
  ) {}

  /** Actions taken against me, and whether each can still be appealed. */
  @Get('me/moderation-actions')
  async myActions(@CurrentUser() user: AuthenticatedUser) {
    return this.moderation.actionsAgainst(user.userId);
  }

  @Post('appeals')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(submitAppealSchema)) body: SubmitAppealDto,
  ) {
    return this.appeals.submit(user.userId, body.actionId, body.reason);
  }

  @Get('appeals/:id')
  async status(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appeals.statusFor(user.userId, id);
  }
}
