import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, SupportChannel } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import {
  SupportResourcesService,
  type SupportiveIntervention,
} from '../safety/support-resources.service.js';
import { AuditService } from './audit.service.js';

export interface SupportResourceAdminView {
  id: string;
  region: string;
  name: string;
  channel: SupportChannel;
  value: string;
  hours: string;
  language: string;
  isActive: boolean;
  verifiedAt: Date;
  sourceUrl: string;
  /**
   * True when past the re-verification window.
   *
   * A stale entry is already invisible to users — `resourcesFor` filters it out
   * (E07-T07). This flag is what makes the admin list show *why* something a
   * moderator can see is not reaching anyone.
   */
  isStale: boolean;
  daysUntilStale: number;
}

export interface SupportResourcesAdminList {
  items: SupportResourceAdminView[];
  readiness: {
    ready: boolean;
    activeCount: number;
    staleCount: number;
    /** A hard warning when nothing is live, never a neutral empty state. */
    warning: string | null;
  };
  reverifyDays: number;
}

/**
 * The empty-state warning.
 *
 * PRD §15.2 makes a valid hotline list a release blocker, and this is the copy
 * that says so in the one place somebody could fix it. Deliberately not
 * softened: an admin panel that shows "No resources yet" next to a plus button
 * reads like an empty inbox, and the Level 3 screen is currently falling back
 * to nothing.
 */
const EMPTY_WARNING =
  'TIDAK ADA support resource aktif untuk region ini. Layar krisis Level 3 ' +
  'sekarang tampil tanpa satu pun nomor yang bisa dihubungi. Ini blocker rilis ' +
  '(PRD §15.2) — bukan daftar yang belum diisi.';

const STALE_WARNING =
  'Ada entri yang kedaluwarsa dan sudah otomatis disembunyikan dari user. ' +
  'Verifikasi ulang atau nonaktifkan.';

/**
 * Support resources management — E14-T13. PRD §15.2, TECH-SPEC §18.5,
 * DESIGN-REF §3.14.
 *
 * Two things this service refuses to allow, both because a dead hotline is
 * worse than no hotline — somebody in crisis dials it, fails, and feels more
 * alone than before:
 *
 *  - **no entry without a `sourceUrl`.** Not a soft requirement: the column is
 *    non-null and every write path here demands it. An entry that went live on
 *    somebody's recollection cannot be re-checked by the next person.
 *  - **no way to mark something verified without saying where from.**
 *    Re-verification takes a fresh `sourceUrl` too, because "I checked it" a
 *    quarter later is a different claim from "here is the page I checked".
 */
@Injectable()
export class SupportResourcesAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly resources: SupportResourcesService,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async list(region = 'ID'): Promise<SupportResourcesAdminList> {
    const reverifyDays = await this.appConfig.getNumber('support_resources.reverify_days');
    const staleBefore = new Date(Date.now() - reverifyDays * 86_400_000);

    const [rows, readiness] = await Promise.all([
      this.prisma.supportResource.findMany({
        where: { region },
        orderBy: [{ isActive: 'desc' }, { verifiedAt: 'asc' }],
      }),
      this.resources.readiness(region),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      region: row.region,
      name: row.name,
      channel: row.channel,
      value: row.value,
      hours: row.hours,
      language: row.language,
      isActive: row.isActive,
      verifiedAt: row.verifiedAt,
      sourceUrl: row.sourceUrl,
      isStale: row.verifiedAt < staleBefore,
      daysUntilStale: Math.ceil(
        (row.verifiedAt.getTime() + reverifyDays * 86_400_000 - Date.now()) / 86_400_000,
      ),
    }));

    return {
      items,
      readiness: {
        ...readiness,
        warning: !readiness.ready
          ? EMPTY_WARNING
          : readiness.staleCount > 0
            ? STALE_WARNING
            : null,
      },
      reverifyDays,
    };
  }

  /**
   * Exactly what a user in crisis would see.
   *
   * Rendered from `buildIntervention`, the same call the Level 3 screen makes —
   * not a mock-up of it. DESIGN-REF §3.14 asks for a preview so a mistake is
   * caught before it ships, and a preview built from different code would be
   * the mistake.
   */
  async preview(region = 'ID'): Promise<SupportiveIntervention> {
    return this.resources.buildIntervention(region);
  }

  async create(input: {
    adminId: string;
    region: string;
    name: string;
    channel: SupportChannel;
    value: string;
    hours: string;
    language: string;
    sourceUrl: string;
    /** Off by default — a new entry is reviewed, then switched on. */
    isActive?: boolean;
  }): Promise<SupportResourceAdminView> {
    this.requireSourceUrl(input.sourceUrl);

    const created = await this.prisma.supportResource.create({
      data: {
        region: input.region,
        name: input.name.trim(),
        channel: input.channel,
        value: input.value.trim(),
        hours: input.hours.trim(),
        language: input.language,
        sourceUrl: input.sourceUrl.trim(),
        // Creating an entry counts as verifying it: the admin has the source
        // page open right now, which is exactly the moment the claim is true.
        verifiedAt: new Date(),
        isActive: input.isActive ?? false,
      },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.support_resource.created',
      targetType: 'support_resource',
      targetId: created.id,
      diff: {
        name: created.name,
        channel: created.channel,
        region: created.region,
        sourceUrl: created.sourceUrl,
        isActive: created.isActive,
      },
    });

    return (await this.list(input.region)).items.find((item) => item.id === created.id)!;
  }

  async update(input: {
    adminId: string;
    id: string;
    name?: string | undefined;
    value?: string | undefined;
    hours?: string | undefined;
    isActive?: boolean | undefined;
    sourceUrl?: string | undefined;
  }): Promise<SupportResourceAdminView> {
    const before = await this.require(input.id);

    if (input.sourceUrl !== undefined) this.requireSourceUrl(input.sourceUrl);

    // Changing the number people dial is a new claim about the world, so it
    // needs a fresh source — otherwise the `verifiedAt` date would vouch for a
    // value nobody checked.
    const valueChanged = input.value !== undefined && input.value.trim() !== before.value;
    if (valueChanged && input.sourceUrl === undefined) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Mengubah nomor atau tautan kontak wajib disertai source_url yang baru.',
      );
    }

    const after = await this.prisma.supportResource.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.value !== undefined ? { value: input.value.trim() } : {}),
        ...(input.hours !== undefined ? { hours: input.hours.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sourceUrl !== undefined
          ? { sourceUrl: input.sourceUrl.trim(), verifiedAt: new Date() }
          : {}),
      },
    });

    await this.audit.recordChange(
      {
        actorId: input.adminId,
        action: 'admin.support_resource.updated',
        targetType: 'support_resource',
        targetId: input.id,
      },
      {
        name: before.name,
        value: before.value,
        hours: before.hours,
        isActive: before.isActive,
        sourceUrl: before.sourceUrl,
      },
      {
        name: after.name,
        value: after.value,
        hours: after.hours,
        isActive: after.isActive,
        sourceUrl: after.sourceUrl,
      },
    );

    return (await this.list(after.region)).items.find((item) => item.id === after.id)!;
  }

  /**
   * Records a re-verification.
   *
   * A fresh `sourceUrl` is required rather than optional. "I checked it" three
   * months on is a weaker claim than "here is the page I checked", and the
   * whole point of the timestamp is that somebody can retrace the check.
   */
  async verify(input: {
    adminId: string;
    id: string;
    sourceUrl: string;
  }): Promise<SupportResourceAdminView> {
    const before = await this.require(input.id);
    this.requireSourceUrl(input.sourceUrl);

    const after = await this.prisma.supportResource.update({
      where: { id: input.id },
      data: { sourceUrl: input.sourceUrl.trim(), verifiedAt: new Date() },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.support_resource.verified',
      targetType: 'support_resource',
      targetId: input.id,
      diff: {
        previousVerifiedAt: before.verifiedAt.toISOString(),
        sourceUrl: after.sourceUrl,
      },
    });

    return (await this.list(after.region)).items.find((item) => item.id === after.id)!;
  }

  /**
   * Deactivates an entry.
   *
   * No delete: the record that a number was live during a period is part of
   * what an incident review would need, and deleting it would leave a crisis
   * screen in the logs pointing at nothing explicable.
   */
  async deactivate(input: {
    adminId: string;
    id: string;
    reason: string;
  }): Promise<SupportResourceAdminView> {
    const before = await this.require(input.id);

    if (input.reason.trim().length < 10) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Menonaktifkan hotline wajib punya alasan.',
      );
    }

    await this.prisma.supportResource.update({
      where: { id: input.id },
      data: { isActive: false },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.support_resource.deactivated',
      targetType: 'support_resource',
      targetId: input.id,
      diff: { name: before.name, reason: input.reason.trim() },
    });

    return (await this.list(before.region)).items.find((item) => item.id === input.id)!;
  }

  private async require(id: string) {
    const found = await this.prisma.supportResource.findUnique({ where: { id } });
    if (!found) {
      throw ApiException.notFound('NOT_FOUND', 'Support resource itu tidak ditemukan.');
    }
    return found;
  }

  /**
   * A source has to be a real, fetchable address.
   *
   * `http(s)` only: a note like "dari telepon ke Kemenkes" is exactly the kind
   * of provenance this field exists to rule out.
   */
  private requireSourceUrl(sourceUrl: string): void {
    const trimmed = sourceUrl.trim();

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'source_url wajib berupa URL resmi yang bisa dibuka lagi nanti.',
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw ApiException.badRequest('VALIDATION_ERROR', 'source_url harus http atau https.');
    }
  }
}
