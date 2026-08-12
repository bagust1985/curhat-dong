import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { AliasService } from '../profiles/alias.service.js';
import { ConsentService, REQUIRED_CONSENTS } from './consent.service.js';
import type { OnboardingDto } from './users.dto.js';

/** How long a rejected age declaration blocks retries from the same device. */
const AGE_GATE_COOLDOWN_SECONDS = 24 * 60 * 60;

export interface OnboardingResult {
  alias: string;
  topics: string[];
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly alias: AliasService,
    private readonly consent: ConsentService,
  ) {}

  /**
   * Age gate — PRD §25.5.
   *
   * MVP uses self-declaration, not identity verification. Asking an anonymous
   * platform for an ID card would destroy the premise it is built on; the
   * honest description is "intended for 18+", not "verified 18+".
   *
   * A rejection puts the device on cooldown so the obvious next move — try
   * again with a different birth date — does not work instantly.
   */
  async checkAgeGate(deviceKey: string, isAdult: boolean): Promise<void> {
    const cooldownKey = `agegate:blocked:${deviceKey}`;

    const blocked = await this.redis.get(cooldownKey).catch(() => null);
    if (blocked) {
      throw ApiException.forbidden(
        'AGE_GATE_COOLDOWN',
        'Kamu baru saja mencoba. Coba lagi besok ya.',
      );
    }

    if (!isAdult) {
      await this.redis
        .set(cooldownKey, '1', 'EX', AGE_GATE_COOLDOWN_SECONDS)
        .catch(() => undefined);

      throw ApiException.forbidden(
        'AGE_GATE_REJECTED',
        'CURHAT DONG ditujukan untuk usia 18 tahun ke atas.',
      );
    }
  }

  /**
   * Completes onboarding — PRD §5.
   *
   * Atomic: a failure part-way through must not leave a half-created account
   * with, say, an alias but no consent record.
   *
   * Idempotent: calling it again for an already-onboarded user returns the
   * existing profile rather than erroring, because a retried request after a
   * flaky connection is a normal thing for a client to do.
   */
  async complete(
    userId: string,
    deviceKey: string,
    input: OnboardingDto,
  ): Promise<OnboardingResult> {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { alias: true, topics: true },
    });

    if (existing) {
      return { alias: existing.alias, topics: existing.topics };
    }

    await this.checkAgeGate(deviceKey, input.isAdult);

    // Both required consents must be present and granted. Analytics may be
    // absent or false — it is optional by design (PRD §25.3).
    const granted = new Set(
      input.consents.filter((entry) => entry.granted).map((entry) => entry.consentType),
    );

    const missing = REQUIRED_CONSENTS.filter((type) => !granted.has(type));
    if (missing.length > 0) {
      throw ApiException.forbidden(
        'CONSENT_REQUIRED',
        'Kamu perlu menyetujui syarat layanan dan pemrosesan data dulu.',
      );
    }

    const alias = input.alias
      ? await this.alias.assertUsable(input.alias)
      : await this.alias.generateAvailable();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { ageDeclaredAt: new Date() },
      });

      await tx.userProfile.create({
        data: {
          userId,
          alias,
          aliasLower: alias.toLowerCase(),
          topics: input.topics ?? [],
          ...(input.avatar ? { avatar: input.avatar } : {}),
          ...(input.reason ? { onboardingReason: input.reason } : {}),
        },
      });

      await tx.notificationSetting.create({ data: { userId } });
    });

    // Outside the transaction: consent is an upsert loop, and a duplicate-key
    // retry inside a transaction would roll back the whole profile creation.
    await this.consent.record(userId, input.consents, 'onboarding');

    return { alias, topics: input.topics ?? [] };
  }
}
