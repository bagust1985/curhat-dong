import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { feltHeardAnswerSchema, type FeltHeardAnswerDto } from '../comments/comments.dto.js';
import { FeltHeardService, type PendingPrompt } from './felt-heard.service.js';

@Controller()
export class FeltHeardController {
  constructor(private readonly feltHeard: FeltHeardService) {}

  /** Prompts ready to show, already filtered by the anti-fatigue rules. */
  @Get('me/felt-heard/pending')
  async pending(@CurrentUser() user: AuthenticatedUser): Promise<PendingPrompt[]> {
    return this.feltHeard.pending(user.userId);
  }

  @Post('felt-heard/answer')
  async answer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(feltHeardAnswerSchema)) body: FeltHeardAnswerDto,
  ): Promise<{ status: 'ok' }> {
    await this.feltHeard.answer(user.userId, body.promptId, body.answer);
    return { status: 'ok' };
  }

  /**
   * Dismisses a prompt.
   *
   * Recorded as dismissed, never as "no" — see FeltHeardService for why that
   * distinction is what keeps the North Star meaningful.
   */
  @Post('felt-heard/:promptId/dismiss')
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('promptId') promptId: string,
  ): Promise<{ status: 'dismissed' }> {
    await this.feltHeard.dismiss(user.userId, promptId);
    return { status: 'dismissed' };
  }
}
