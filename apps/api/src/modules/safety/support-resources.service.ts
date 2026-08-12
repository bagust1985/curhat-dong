import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';

export interface SupportResourceView {
  name: string;
  channel: 'phone' | 'chat' | 'whatsapp' | 'web';
  value: string;
  hours: string;
  language: string;
}

export interface SupportiveIntervention {
  message: string;
  resources: SupportResourceView[];
  /** True when no verified resource exists and the honest alternatives show instead. */
  usingFallback: boolean;
  alternatives: Array<{ label: string; action: string }>;
}

/**
 * Supportive intervention — PRD §8, §15.1, §15.2.
 *
 * The most carefully-worded screen in the product. What it must never contain
 * is as important as what it does: no risk score, no safety level, no
 * punishment, no clinical framing (non-negotiable #2).
 */
@Injectable()
export class SupportResourcesService {
  private readonly logger = new Logger(SupportResourcesService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Verified, active resources for a region.
   *
   * Entries stale beyond the re-verification window are excluded
   * automatically. A hotline that has moved or shut down is worse than showing
   * nothing: someone in crisis dials it, fails, and feels more alone
   * (PRD §15.2).
   */
  async resourcesFor(region = 'ID'): Promise<SupportResourceView[]> {
    const reverifyDays = await this.appConfig.getNumber('support_resources.reverify_days');
    const freshSince = new Date(Date.now() - reverifyDays * 86_400_000);

    const resources = await this.prisma.supportResource.findMany({
      where: { region, isActive: true, verifiedAt: { gte: freshSince } },
      orderBy: { name: 'asc' },
      select: { name: true, channel: true, value: true, hours: true, language: true },
    });

    if (resources.length === 0) {
      this.logger.error(
        `no verified support resources for region ${region} — the crisis screen has nothing to show`,
      );
    }

    return resources;
  }

  async buildIntervention(region = 'ID'): Promise<SupportiveIntervention> {
    const resources = await this.resourcesFor(region);

    return {
      // Warm, brief, no diagnosis, no clinical distance (DESIGN-REF §2.7).
      message:
        'Makasih udah cerita. Kelihatannya lagi berat banget buat kamu sekarang. ' +
        'Kamu nggak sendirian — ada orang yang siap dengerin.',
      resources,
      usingFallback: resources.length === 0,
      // Always offered, resources or not. When the list is empty these are the
      // whole screen, so they are never a footnote.
      alternatives: [
        { label: 'Ngobrol sama DONG AI', action: 'open_ai' },
        { label: 'Cari Listener sekarang', action: 'find_listener' },
        { label: 'Aku mengerti, tutup', action: 'dismiss' },
      ],
    };
  }

  /**
   * Health signal for ops and the admin dashboard (E14-T13).
   *
   * An empty list is a release blocker, not a neutral state — the Level 3
   * screen depends on it having content.
   */
  async readiness(region = 'ID'): Promise<{ ready: boolean; activeCount: number; staleCount: number }> {
    const reverifyDays = await this.appConfig.getNumber('support_resources.reverify_days');
    const freshSince = new Date(Date.now() - reverifyDays * 86_400_000);

    const [activeCount, staleCount] = await Promise.all([
      this.prisma.supportResource.count({
        where: { region, isActive: true, verifiedAt: { gte: freshSince } },
      }),
      this.prisma.supportResource.count({
        where: { region, isActive: true, verifiedAt: { lt: freshSince } },
      }),
    ]);

    return { ready: activeCount > 0, activeCount, staleCount };
  }
}
