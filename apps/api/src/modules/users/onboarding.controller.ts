import { Body, Controller, Delete, Get, Inject, Patch, Post, Query, Req } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { hashIp } from '@curhat/auth';
import type { Request } from 'express';

import { clientIpOf } from '../../common/client-ip.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ENV } from '../../config/env.config.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { AliasService } from '../profiles/alias.service.js';
import { AccountService } from './account.service.js';
import { ConsentService } from './consent.service.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { OnboardingService } from './onboarding.service.js';
import {
  consentUpdateSchema,
  deleteAccountSchema,
  notificationSettingsSchema,
  onboardingSchema,
  type ConsentUpdateDto,
  type DeleteAccountDto,
  type NotificationSettingsDto,
  type OnboardingDto,
} from './users.dto.js';

@Controller()
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly consent: ConsentService,
    private readonly alias: AliasService,
    private readonly account: AccountService,
    private readonly notificationSettings: NotificationSettingsService,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  @Post('onboarding')
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(onboardingSchema)) body: OnboardingDto,
    @Req() request: Request,
  ) {
    return this.onboarding.complete(user.userId, this.deviceKeyOf(request, body.deviceId), body);
  }

  // --- Alias (DESIGN-REF §2.3 step 4) --------------------------------------

  @Get('onboarding/alias/suggestions')
  async suggestions() {
    return this.alias.suggest(5);
  }

  @Get('onboarding/alias/check')
  async checkAlias(@Query('alias') alias: string) {
    const validation = this.alias.validate(alias ?? '');

    if (!validation.valid) {
      return { available: false, reason: validation.reason };
    }

    const available = await this.alias.isAvailable(alias);
    return {
      available,
      ...(available ? {} : { reason: 'Alias itu sudah dipakai. Coba yang lain ya.' }),
    };
  }

  // --- Consent (PRD §25.3) -------------------------------------------------

  @Get('me/consents')
  async consents(@CurrentUser() user: AuthenticatedUser) {
    return this.consent.stateFor(user.userId);
  }

  @Post('me/consents')
  async updateConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(consentUpdateSchema)) body: ConsentUpdateDto,
  ) {
    await this.consent.record(user.userId, body.consents, 'settings');
    return this.consent.stateFor(user.userId);
  }

  // --- Notification settings (PRD §14) -------------------------------------

  @Get('me/notification-settings')
  async notificationPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationSettings.get(user.userId);
  }

  @Patch('me/notification-settings')
  async updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(notificationSettingsSchema)) body: NotificationSettingsDto,
  ) {
    await this.notificationSettings.update(user.userId, body);
    return this.notificationSettings.get(user.userId);
  }

  // --- Data & deletion (PRD §25.2, §25.4) ----------------------------------

  @Post('me/export')
  async requestExport(@CurrentUser() user: AuthenticatedUser) {
    return this.account.requestExport(user.userId);
  }

  /**
   * Returns the export inline.
   *
   * MVP builds it on demand; the async job with a signed, expiring URL lands
   * with object storage in E17.
   */
  @Get('me/export/preview')
  async exportPreview(@CurrentUser() user: AuthenticatedUser) {
    return this.account.buildExport(user.userId);
  }

  /** What the user is shown before confirming — the UI must display this. */
  @Get('me/deletion-consequences')
  consequences(@Query('mode') mode: string) {
    const chosen = mode === 'anonymize' ? 'anonymize' : 'purge';
    return { mode: chosen, consequences: this.account.deletionConsequences(chosen) };
  }

  @Delete('me')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountDto,
  ) {
    const result = await this.account.deleteAccount(user.userId, body.mode);
    return { ...result, consequences: this.account.deletionConsequences(body.mode) };
  }

  /**
   * Identity for the age-gate cooldown.
   *
   * Device id when the client sends one, IP hash otherwise. Neither is
   * unforgeable — the point is to stop the obvious retry, not to build an
   * identity system on a platform whose premise is anonymity.
   */
  private deviceKeyOf(request: Request, deviceId?: string): string {
    return deviceId ?? hashIp(clientIpOf(request), this.env.TOKEN_ENCRYPTION_KEY);
  }
}
