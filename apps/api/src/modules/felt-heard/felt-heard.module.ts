import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FeltHeardController } from './felt-heard.controller.js';
import { FeltHeardService } from './felt-heard.service.js';

/**
 * Felt Heard — the North Star Metric (PRD §9, §19.1).
 *
 * Exported because comments and listener sessions both create prompts, and the
 * anti-fatigue rules must be applied in exactly one place.
 */
@Module({
  imports: [AuthModule],
  controllers: [FeltHeardController],
  providers: [FeltHeardService],
  exports: [FeltHeardService],
})
export class FeltHeardModule {}
