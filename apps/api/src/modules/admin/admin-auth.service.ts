import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  decrypt,
  encrypt,
  generateTotpSecret,
  totpUri,
  verifyTotpStep,
} from '@curhat/auth';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient } from '@curhat/database';
import type { AdminRole } from '@curhat/types';
import type { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';
import { SessionService, type TokenPair } from '../auth/session.service.js';
import { AuditService } from './audit.service.js';
import { isAdminRole } from './permissions.js';

export interface MfaEnrolment {
  /** Shown once, at enrolment. Never returned again. */
  secret: string;
  /** `otpauth://` URI for the QR code. */
  uri: string;
}

export interface AdminLoginResult extends TokenPair {
  role: AdminRole;
  mfaVerifiedAt: Date;
}

/**
 * How long a step-up stays fresh.
 *
 * Fifteen minutes: long enough to work through a case without re-typing a
 * code for every action, short enough that an unattended laptop is not a
 * standing authorisation to ban people.
 */
const REAUTH_WINDOW_MS = 15 * 60 * 1000;

/** Failed MFA attempts before the account is locked out. */
const MAX_MFA_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

/**
 * Admin authentication — E14-T01. TECH-SPEC §7.4.
 *
 * MFA is mandatory, not offered. The shape that enforces it: an admin session
 * is issued only *after* a valid TOTP code, so there is no window in which a
 * password-equivalent alone produces a usable token. Getting this wrong in the
 * other direction — issue the session, then ask for MFA — is the common
 * mistake, and it leaves a token that works on every endpoint that forgot to
 * re-check.
 *
 * Admins authenticate with the same email OTP as everyone else (there are no
 * passwords in this product), so MFA is genuinely a second factor: something
 * emailed, then something held.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Starts TOTP enrolment.
   *
   * The secret is stored immediately but `mfaEnabledAt` stays null until a
   * code is confirmed — otherwise an interrupted enrolment would leave an
   * account that believes it has MFA while the admin never scanned the QR,
   * locking them out permanently.
   *
   * Re-enrolling while MFA is already active is refused: that would be the
   * single most useful endpoint for anyone who stole a session.
   */
  async beginEnrolment(userId: string): Promise<MfaEnrolment> {
    const user = await this.requireAdmin(userId);

    if (user.mfaEnabledAt) {
      throw ApiException.conflict(
        'CONFLICT',
        'MFA sudah aktif. Hubungi Super Admin untuk mereset.',
      );
    }

    const secret = generateTotpSecret();

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: encrypt(secret, this.env.TOKEN_ENCRYPTION_KEY) },
    });

    await this.audit.record({
      actorId: userId,
      action: 'admin.mfa.enrolment_started',
      targetType: 'admin_user',
      targetId: userId,
    });

    return {
      secret,
      uri: totpUri({ secret, accountName: `admin-${userId.slice(0, 8)}` }),
    };
  }

  /** Confirms enrolment with the first code, activating MFA. */
  async confirmEnrolment(userId: string, code: string): Promise<{ enabled: true }> {
    const user = await this.requireAdmin(userId);

    if (user.mfaEnabledAt) {
      throw ApiException.conflict('CONFLICT', 'MFA sudah aktif.');
    }
    if (!user.mfaSecretEncrypted) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Mulai pendaftaran MFA dulu.');
    }

    const step = await this.consumeCode(user.id, user.mfaSecretEncrypted, user.mfaLastStep, code);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabledAt: new Date(), mfaLastStep: step },
    });

    await this.audit.record({
      actorId: userId,
      action: 'admin.mfa.enabled',
      targetType: 'admin_user',
      targetId: userId,
    });

    return { enabled: true };
  }

  /**
   * Exchanges a verified identity plus a TOTP code for an admin session.
   *
   * `userId` here has already proved the first factor through the ordinary
   * email OTP flow. This is the second.
   */
  async login(
    userId: string,
    code: string,
    context: { ipHash?: string | undefined; userAgent?: string | undefined } = {},
  ): Promise<AdminLoginResult> {
    const user = await this.requireAdmin(userId);

    if (!user.mfaEnabledAt || !user.mfaSecretEncrypted) {
      // Not a soft failure: an admin account without MFA must not be able to
      // reach anything (TECH-SPEC §7.4). Enrol first.
      throw ApiException.forbidden('ADMIN_MFA_REQUIRED', 'Akun admin ini belum mengaktifkan MFA.');
    }

    const step = await this.consumeCode(user.id, user.mfaSecretEncrypted, user.mfaLastStep, code);
    const mfaVerifiedAt = new Date();

    const tokens = await this.sessions.issue(userId, {
      ...(context.ipHash !== undefined ? { ipHash: context.ipHash } : {}),
      ...(context.userAgent !== undefined ? { userAgent: context.userAgent } : {}),
    });

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { mfaLastStep: step } }),
      // Stamps the newest session for this user — the one just minted.
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { mfaVerifiedAt },
      }),
    ]);

    await this.audit.record({
      actorId: userId,
      action: 'admin.login',
      targetType: 'admin_user',
      targetId: userId,
      ...(context.ipHash !== undefined ? { ipHash: context.ipHash } : {}),
    });

    return { ...tokens, role: user.adminRole as AdminRole, mfaVerifiedAt };
  }

  /**
   * Re-proves the second factor for a sensitive action (E14-T01).
   *
   * Refreshes `mfaVerifiedAt` on the session rather than issuing a new token:
   * step-up is about the person still being there, not about a new identity.
   */
  async stepUp(userId: string, sessionId: string, code: string): Promise<{ verifiedAt: Date }> {
    const user = await this.requireAdmin(userId);

    if (!user.mfaEnabledAt || !user.mfaSecretEncrypted) {
      throw ApiException.forbidden('ADMIN_MFA_REQUIRED', 'Akun admin ini belum mengaktifkan MFA.');
    }

    const step = await this.consumeCode(user.id, user.mfaSecretEncrypted, user.mfaLastStep, code);
    const verifiedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { mfaLastStep: step } }),
      this.prisma.userSession.updateMany({
        where: { id: sessionId, userId },
        data: { mfaVerifiedAt: verifiedAt },
      }),
    ]);

    return { verifiedAt };
  }

  /** True when this session has satisfied MFA at all. */
  async isMfaSatisfied(sessionId: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { mfaVerifiedAt: true },
    });

    return session?.mfaVerifiedAt !== null && session?.mfaVerifiedAt !== undefined;
  }

  /** True when the step-up is recent enough for a sensitive action. */
  async isReauthFresh(sessionId: string, now: Date = new Date()): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { mfaVerifiedAt: true },
    });

    if (!session?.mfaVerifiedAt) return false;
    return now.getTime() - session.mfaVerifiedAt.getTime() <= REAUTH_WINDOW_MS;
  }

  /**
   * Verifies a code, enforcing lockout and single use.
   *
   * Three things happen here that are easy to leave out:
   *
   *  - lockout is checked *before* verification, so a locked account cannot be
   *    used as an oracle;
   *  - the attempt counter is incremented on failure and cleared on success,
   *    in Redis, so it survives across processes;
   *  - the consumed step is recorded, because a TOTP code stays valid for its
   *    whole window. Without this, a code captured by a phishing page can be
   *    replayed within the minute.
   *
   * Redis being unavailable fails *closed*. Everywhere else in this codebase a
   * counter outage fails open so users are not punished for our operational
   * problem — but this counter is the only thing standing between a stolen
   * email inbox and unlimited guesses at six digits.
   */
  private async consumeCode(
    userId: string,
    secretEncrypted: string,
    lastStep: number | null,
    code: string,
  ): Promise<number> {
    const attemptsKey = `admin:mfa:attempts:${userId}`;

    let attempts: number;
    try {
      attempts = Number((await this.redis.get(attemptsKey)) ?? 0);
    } catch (error) {
      this.logger.error('MFA lockout counter unavailable; refusing login', error);
      throw ApiException.unavailable(
        'SERVICE_UNAVAILABLE',
        'Login admin sedang tidak bisa diproses. Coba lagi sebentar lagi.',
      );
    }

    if (attempts >= MAX_MFA_ATTEMPTS) {
      throw ApiException.tooManyRequests(
        'ADMIN_MFA_LOCKED',
        'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
      );
    }

    let secret: string;
    try {
      secret = decrypt(secretEncrypted, this.env.TOKEN_ENCRYPTION_KEY);
    } catch (error) {
      this.logger.error(`unreadable MFA secret for admin ${userId}`, error);
      throw ApiException.unavailable('SERVICE_UNAVAILABLE', 'MFA tidak bisa diverifikasi.');
    }

    // The *matched* step, not the current one. Recording the current step would
    // file a legitimate next-step code under this step, and then reject it as a
    // replay when its real step came around — the accepted window spans three.
    const step = verifyTotpStep(secret, code, { at: new Date() });

    // A code from a step already spent cannot be used again. `<=` rather than
    // `===` because a code from further back is also inside the window.
    const replayed = step !== null && lastStep !== null && step <= lastStep;

    if (step === null || replayed) {
      await this.registerFailure(attemptsKey);
      throw ApiException.unauthorized('ADMIN_MFA_INVALID', 'Kode MFA salah atau sudah dipakai.');
    }

    await this.redis.del(attemptsKey).catch(() => undefined);
    return step;
  }

  private async registerFailure(attemptsKey: string): Promise<void> {
    try {
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) await this.redis.expire(attemptsKey, LOCKOUT_SECONDS);
    } catch (error) {
      this.logger.warn('failed to record MFA attempt', error);
    }
  }

  private async requireAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        adminRole: true,
        status: true,
        mfaEnabledAt: true,
        mfaSecretEncrypted: true,
        mfaLastStep: true,
      },
    });

    // 403 rather than 404: the caller already authenticated as themselves, so
    // there is nothing to conceal about their own account.
    if (!user || !isAdminRole(user.adminRole) || user.status !== 'active') {
      throw ApiException.forbidden('FORBIDDEN', 'Akun ini bukan admin.');
    }

    return user;
  }
}
