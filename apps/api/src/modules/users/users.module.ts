import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AccountService } from './account.service.js';
import { ConsentService } from './consent.service.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

/**
 * Account lifecycle: onboarding, consent, profile, block, export, deletion
 * (E03-T10, E03-T11, E04).
 *
 * UsersService and ConsentService are exported because feed, comments,
 * listener matching and analytics all need them — the two-way block rule
 * (PRD §15) and the optional-analytics rule (PRD §25.3) must behave
 * identically everywhere, not be reimplemented per module.
 */
@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [UsersController, OnboardingController],
  providers: [
    UsersService,
    OnboardingService,
    ConsentService,
    AccountService,
    NotificationSettingsService,
  ],
  exports: [UsersService, ConsentService, NotificationSettingsService],
})
export class UsersModule {}
