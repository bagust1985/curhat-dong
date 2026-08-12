import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Cloudflare Turnstile — TECH-SPEC §7.3.
 *
 * Shown only when traffic from an IP looks anomalous, not on every login: a
 * challenge in the normal path is friction for everyone and stops nobody
 * determined. The site key is public; the secret key never leaves the server.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    @Inject(ENV) private readonly env: ServerEnv,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
  ) {}

  /** Records an attempt and reports whether this IP now needs a challenge. */
  async isChallengeRequired(ipHash: string): Promise<boolean> {
    const key = `turnstile:attempts:${ipHash}`;
    const threshold = await this.appConfig.getNumber('turnstile.anomaly_threshold');
    const windowSeconds = await this.appConfig.getNumber('turnstile.anomaly_window_seconds');

    try {
      const attempts = await this.redis.incr(key);
      if (attempts === 1) await this.redis.expire(key, windowSeconds);
      return attempts > threshold;
    } catch {
      // Cannot measure the anomaly signal. Demanding a challenge is the safe
      // direction: worst case a legitimate user solves one they did not need.
      this.logger.warn('anomaly counter unavailable; requiring Turnstile');
      return true;
    }
  }

  /**
   * Verifies a token with Cloudflare.
   *
   * Always server-side. A client-reported "I passed the challenge" is worth
   * nothing, since the client is exactly what a bot controls.
   */
  async verify(token: string | undefined, ipHash: string): Promise<void> {
    if (!token) {
      throw ApiException.badRequest(
        'AUTH_TURNSTILE_REQUIRED',
        'Verifikasi dulu bahwa kamu bukan robot ya.',
      );
    }

    let body: TurnstileVerifyResponse;

    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: this.env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
        signal: AbortSignal.timeout(5000),
      });
      body = (await response.json()) as TurnstileVerifyResponse;
    } catch (error) {
      this.logger.error('Turnstile verification request failed', error);
      throw ApiException.unavailable(
        'SERVICE_UNAVAILABLE',
        'Verifikasi lagi bermasalah. Coba lagi sebentar lagi ya.',
      );
    }

    if (!body.success) {
      this.logger.warn(`Turnstile rejected a token: ${(body['error-codes'] ?? []).join(',')}`);
      throw ApiException.badRequest(
        'AUTH_TURNSTILE_INVALID',
        'Verifikasi gagal. Coba ulangi ya.',
      );
    }

    await this.redis.del(`turnstile:attempts:${ipHash}`).catch(() => undefined);
  }
}
