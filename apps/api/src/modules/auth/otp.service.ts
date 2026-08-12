import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient } from '@curhat/database';
import { generateOtpCode, hashEmail, hashToken, safeCompare } from '@curhat/auth';
import type { EmailProvider } from '@curhat/notifications';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { ENV } from '../../config/env.config.js';
import { EMAIL_PROVIDER } from './auth.tokens.js';

export const OTP_TTL_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;

export interface OtpVerifyResult {
  emailHash: string;
}

/**
 * Email OTP — TECH-SPEC §3.1.
 *
 * Two properties matter more than anything else here:
 *   - the stored code is a hash, so a database dump yields no working codes;
 *   - every response is the same shape whether or not the address exists, so
 *     the endpoint cannot be used to enumerate accounts. On a platform where
 *     having an account is itself sensitive, enumeration is a real harm.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly rateLimit: RateLimitService,
    private readonly appConfig: AppConfigService,
  ) {}

  async request(email: string, ipHash: string): Promise<void> {
    const emailHash = hashEmail(email, this.env.TOKEN_ENCRYPTION_KEY);
    const perHour = await this.appConfig.getNumber('rate_limit.otp_per_hour_per_email');

    // Fails closed: if Redis is down we cannot count attempts, and an
    // uncounted OTP endpoint is an open door.
    await this.rateLimit.enforce(
      { bucket: 'otp:request:email', subject: emailHash, limit: perHour, windowSeconds: 3600 },
      { failClosed: true },
    );
    await this.rateLimit.enforce(
      { bucket: 'otp:request:ip', subject: ipHash, limit: perHour * 4, windowSeconds: 3600 },
      { failClosed: true },
    );

    const code = generateOtpCode();

    await this.prisma.otpChallenge.create({
      data: {
        emailHash,
        codeHash: hashToken(code, this.env.TOKEN_ENCRYPTION_KEY),
        purpose: 'login',
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      },
    });

    try {
      await this.email.sendOtp({ to: email, code, expiresInMinutes: OTP_TTL_MINUTES });
    } catch (error) {
      // Logged without the address — delivery failures end up in the error
      // tracker, and an email there is a PII leak (PRD §20).
      this.logger.error('OTP delivery failed', error);
      throw ApiException.unavailable(
        'SERVICE_UNAVAILABLE',
        'Gagal mengirim kode. Coba lagi sebentar lagi ya.',
      );
    }
  }

  async verify(email: string, code: string): Promise<OtpVerifyResult> {
    const emailHash = hashEmail(email, this.env.TOKEN_ENCRYPTION_KEY);

    await this.rateLimit.enforce(
      { bucket: 'otp:verify', subject: emailHash, limit: 10, windowSeconds: 3600 },
      { failClosed: true },
    );

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { emailHash, purpose: 'login', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw ApiException.badRequest('AUTH_OTP_INVALID', 'Kode salah atau sudah tidak berlaku.');
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw ApiException.badRequest('AUTH_OTP_EXPIRED', 'Kode sudah kedaluwarsa. Minta kode baru.');
    }

    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw ApiException.tooManyRequests(
        'AUTH_OTP_TOO_MANY_ATTEMPTS',
        'Terlalu banyak percobaan. Minta kode baru ya.',
      );
    }

    const expected = hashToken(code, this.env.TOKEN_ENCRYPTION_KEY);

    if (!safeCompare(challenge.codeHash, expected)) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw ApiException.badRequest('AUTH_OTP_INVALID', 'Kode salah atau sudah tidak berlaku.');
    }

    // Consumed immediately: a correct code must not work twice, even if two
    // requests arrive at the same moment.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw ApiException.badRequest('AUTH_OTP_INVALID', 'Kode salah atau sudah tidak berlaku.');
    }

    await this.rateLimit.reset('otp:verify', emailHash);

    return { emailHash };
  }
}
