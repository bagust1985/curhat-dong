import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient } from '@curhat/database';
import {
  burnPasswordVerification,
  decrypt,
  hashEmail,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@curhat/auth';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { ENV } from '../../config/env.config.js';
import { SessionService } from './session.service.js';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * How recently a session must have been minted to count as re-authentication
 * for a password change without `currentPassword`. A fresh session means the
 * caller just proved possession of a factor (OTP, Google or the old password)
 * — this is exactly what makes forgot-password work: OTP login → fresh
 * session → set a new password.
 */
const FRESH_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

const CREDENTIALS_MESSAGE = 'Email atau password-nya nggak cocok. Coba cek lagi ya.';

/**
 * Password login — Revisi 1 (Aug 2026).
 *
 * Exists so a returning user's login stops costing a Resend email. OTP remains
 * the registration and recovery factor; this service only ever *checks* a
 * password or *sets* one for an already-authenticated user.
 *
 * The invariant this service is built around, same as OtpService: the login
 * endpoint must not reveal whether an account exists. Unknown email, known
 * email with no password, and wrong password all cost the same scrypt work and
 * produce the same error.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly rateLimit: RateLimitService,
    private readonly appConfig: AppConfigService,
    private readonly sessions: SessionService,
  ) {}

  async login(email: string, password: string, ipHash: string): Promise<{ userId: string }> {
    const emailHash = hashEmail(email, this.env.TOKEN_ENCRYPTION_KEY);
    const perHour = await this.appConfig.getNumber('rate_limit.password_attempts_per_hour');

    // Fails closed, like every auth counter: an uncounted password endpoint is
    // an online guessing service.
    await this.rateLimit.enforce(
      { bucket: 'password:login:email', subject: emailHash, limit: perHour, windowSeconds: 3600 },
      { failClosed: true },
    );
    await this.rateLimit.enforce(
      { bucket: 'password:login:ip', subject: ipHash, limit: perHour * 4, windowSeconds: 3600 },
      { failClosed: true },
    );

    const account = await this.prisma.authAccount.findFirst({
      where: { emailHash },
      select: { userId: true },
    });

    // Deliberately no status/deletion gate here: OTP login has none either,
    // and the two login methods answering differently for the same account is
    // itself an enumeration signal. Account-status enforcement belongs where
    // it already lives (moderation), not asymmetrically in one login path.
    const user = account
      ? await this.prisma.user.findUnique({
          where: { id: account.userId },
          select: { id: true, passwordHash: true },
        })
      : null;

    if (user === null || user.passwordHash === null) {
      // Burn the same scrypt cost a real check would, then answer exactly what
      // a wrong password answers. Skipping the burn would make "no account"
      // measurably faster than "wrong password" — a timing oracle that undoes
      // the shared error code.
      await burnPasswordVerification(password);
      throw ApiException.unauthorized('AUTH_CREDENTIALS_INVALID', CREDENTIALS_MESSAGE);
    }

    const valid = await verifyPassword(password, user.passwordHash as string);
    if (!valid) {
      throw ApiException.unauthorized('AUTH_CREDENTIALS_INVALID', CREDENTIALS_MESSAGE);
    }

    await this.rateLimit.reset('password:login:email', emailHash);

    // The only moment the plaintext exists next to its stored hash — upgrade
    // hashes recorded at older parameters here, best-effort.
    if (needsRehash(user.passwordHash as string)) {
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(password) },
        });
      } catch (error) {
        this.logger.warn('password rehash failed; keeping the old hash', error);
      }
    }

    return { userId: user.id };
  }

  /**
   * Sets or changes the password of an authenticated user.
   *
   * Changing an existing password requires re-authentication: either the
   * current password, or a session fresh enough that the caller just logged in
   * (the forgot-password path — OTP login then set). A stolen access token
   * alone must not be enough to lock the owner out of their own account.
   */
  async set(
    userId: string,
    sessionId: string,
    input: { password: string; currentPassword?: string | undefined },
  ): Promise<{ changed: boolean }> {
    await this.assertStrongEnough(userId, input.password);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });

    const hadPassword = user.passwordHash !== null;

    if (hadPassword) {
      const reauthed = input.currentPassword
        ? await verifyPassword(input.currentPassword, user.passwordHash as string)
        : await this.isFreshSession(sessionId);

      if (!reauthed) {
        throw ApiException.unauthorized('AUTH_CREDENTIALS_INVALID', CREDENTIALS_MESSAGE);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.password), passwordSetAt: new Date() },
    });

    if (hadPassword) {
      // A changed password usually means "I am worried about my account".
      // Every other session dies; the one doing the changing survives, so the
      // user is not logged out by their own act of caution.
      const revoked = await this.sessions.revokeAllForUser(userId, sessionId);
      if (revoked > 0) {
        this.logger.log(`password change revoked ${revoked} other session(s)`);
      }
    }

    return { changed: hadPassword };
  }

  private async isFreshSession(sessionId: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { createdAt: true },
    });
    if (!session) return false;
    return Date.now() - session.createdAt.getTime() < FRESH_SESSION_MAX_AGE_MS;
  }

  /**
   * NIST-style policy: length is the only composition rule. The one addition —
   * rejecting the account's own email address (or its local part) — is there
   * because it is the single most common weak choice and the one an attacker
   * tries first.
   */
  private async assertStrongEnough(userId: string, password: string): Promise<void> {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw ApiException.badRequest(
        'AUTH_PASSWORD_WEAK',
        `Password minimal ${PASSWORD_MIN_LENGTH} karakter ya.`,
      );
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw ApiException.badRequest(
        'AUTH_PASSWORD_WEAK',
        `Password maksimal ${PASSWORD_MAX_LENGTH} karakter.`,
      );
    }

    const accounts = await this.prisma.authAccount.findMany({
      where: { userId },
      select: { emailEncrypted: true },
    });

    const candidate = password.trim().toLowerCase();
    for (const account of accounts) {
      if (!account.emailEncrypted) continue;
      let address: string;
      try {
        address = decrypt(account.emailEncrypted, this.env.TOKEN_ENCRYPTION_KEY).toLowerCase();
      } catch {
        continue;
      }
      const localPart = address.split('@')[0] ?? '';
      if (candidate === address || (localPart.length >= PASSWORD_MIN_LENGTH && candidate === localPart)) {
        throw ApiException.badRequest(
          'AUTH_PASSWORD_WEAK',
          'Password nggak boleh sama dengan email kamu.',
        );
      }
    }
  }
}
