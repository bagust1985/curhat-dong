import { Inject, Injectable } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient } from '@curhat/database';
import { encrypt, hashEmail } from '@curhat/auth';

import { PRISMA } from '../../common/prisma.service.js';
import { ENV } from '../../config/env.config.js';
import { GoogleAuthService } from './google.service.js';
import { OtpService } from './otp.service.js';
import { SessionService, type SessionContext, type TokenPair } from './session.service.js';
import { TurnstileService } from './turnstile.service.js';

export interface AuthResult extends TokenPair {
  /** True when this call created the account, so the client can route to onboarding. */
  isNewUser: boolean;
  /** False until onboarding completes (E04). */
  hasProfile: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly google: GoogleAuthService,
    private readonly turnstile: TurnstileService,
  ) {}

  async requestOtp(email: string, ipHash: string, turnstileToken?: string): Promise<void> {
    if (await this.turnstile.isChallengeRequired(ipHash)) {
      await this.turnstile.verify(turnstileToken, ipHash);
    }

    await this.otp.request(email, ipHash);
  }

  async verifyOtp(email: string, code: string, context: SessionContext): Promise<AuthResult> {
    await this.otp.verify(email, code);

    const { userId, isNewUser } = await this.findOrCreateUser({
      provider: 'email_otp',
      email,
    });

    return this.completeLogin(userId, isNewUser, context);
  }

  async loginWithGoogle(idToken: string, context: SessionContext): Promise<AuthResult> {
    const identity = await this.google.verifyIdToken(idToken);

    const { userId, isNewUser } = await this.findOrCreateUser({
      provider: 'google',
      email: identity.email,
      providerId: identity.providerId,
    });

    return this.completeLogin(userId, isNewUser, context);
  }

  async refresh(refreshToken: string, context: SessionContext): Promise<TokenPair> {
    return this.sessions.rotate(refreshToken, context);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revokeSession(sessionId);
  }

  /**
   * Revokes every session and clears push tokens.
   *
   * Devices are removed too: a signed-out device that keeps receiving push
   * notifications is both a privacy leak and a bug report waiting to happen.
   */
  async logoutAll(userId: string): Promise<{ revokedSessions: number }> {
    const revokedSessions = await this.sessions.revokeAllForUser(userId);
    await this.prisma.userDevice.deleteMany({ where: { userId } });
    return { revokedSessions };
  }

  /**
   * Finds an account by email hash, or creates one.
   *
   * Accounts are keyed on the email hash across providers, so signing in with
   * Google after using OTP lands on the same account instead of silently
   * creating a second one.
   */
  private async findOrCreateUser(input: {
    provider: 'email_otp' | 'google';
    email: string;
    providerId?: string;
  }): Promise<{ userId: string; isNewUser: boolean }> {
    const emailHash = hashEmail(input.email, this.env.TOKEN_ENCRYPTION_KEY);

    const existing = await this.prisma.authAccount.findFirst({
      where: { emailHash },
      select: { userId: true },
    });

    if (existing) {
      // Link the provider if this is the first time it is used for this
      // account.
      await this.prisma.authAccount.upsert({
        where: {
          provider_emailHash: { provider: input.provider, emailHash },
        },
        update: input.providerId ? { providerId: input.providerId } : {},
        create: {
          userId: existing.userId,
          provider: input.provider,
          emailHash,
          emailEncrypted: encrypt(input.email, this.env.TOKEN_ENCRYPTION_KEY),
          ...(input.providerId ? { providerId: input.providerId } : {}),
        },
      });

      return { userId: existing.userId, isNewUser: false };
    }

    const user = await this.prisma.user.create({
      data: {
        authAccounts: {
          create: {
            provider: input.provider,
            emailHash,
            emailEncrypted: encrypt(input.email, this.env.TOKEN_ENCRYPTION_KEY),
            ...(input.providerId ? { providerId: input.providerId } : {}),
          },
        },
      },
    });

    return { userId: user.id, isNewUser: true };
  }

  private async completeLogin(
    userId: string,
    isNewUser: boolean,
    context: SessionContext,
  ): Promise<AuthResult> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });

    const tokens = await this.sessions.issue(userId, context);

    return { ...tokens, isNewUser, hasProfile: profile !== null };
  }
}
