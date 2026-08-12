import { Inject, Injectable, Logger } from '@nestjs/common';
import { BUILTIN_PROMPTS, promptVersionLabel, type PromptDefinition, type PromptKey } from '@curhat/ai';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';

export interface PromptRevision {
  key: string;
  version: number;
  changeNote: string | null;
  createdAt: Date;
  isActive: boolean;
}

/**
 * Versioned prompts with an audit trail — E08-T04, PRD §18.
 *
 * A prompt change is an append: a new immutable row plus a moved pointer.
 * Rollback moves the pointer back, so a bad prompt is undone in seconds
 * without a deploy, and every classification stays traceable to the exact
 * instructions that produced it.
 */
@Injectable()
export class PromptRegistryService {
  private static readonly CACHE_TTL_MS = 30_000;

  private readonly logger = new Logger(PromptRegistryService.name);
  private readonly cache = new Map<string, { value: PromptDefinition; expiresAt: number }>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * The prompt currently in force.
   *
   * Falls back to the built-in when no row exists — a fresh install classifies
   * correctly before anyone has opened the admin panel, and a database blip
   * degrades to the documented default rather than to no safety prompt at all.
   */
  async active(key: PromptKey): Promise<PromptDefinition> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let definition = BUILTIN_PROMPTS[key];

    try {
      const prompt = await this.prisma.aiPrompt.findUnique({ where: { key } });
      if (prompt) {
        const row = await this.prisma.aiPromptVersion.findUnique({
          where: { key_version: { key, version: prompt.activeVersion } },
        });
        if (row) {
          definition = { key, version: row.version, template: row.template };
        } else {
          this.logger.error(
            `prompt ${key} points at missing version ${prompt.activeVersion}; using built-in`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`prompt lookup failed for ${key}; using built-in`, error);
    }

    this.cache.set(key, {
      value: definition,
      expiresAt: Date.now() + PromptRegistryService.CACHE_TTL_MS,
    });
    return definition;
  }

  /** Stable label recorded on every classification and usage event. */
  async activeLabel(key: PromptKey): Promise<string> {
    return promptVersionLabel(await this.active(key));
  }

  /** Adds a revision and makes it live. Version numbers only ever go up. */
  async publish(input: {
    key: PromptKey;
    template: string;
    actorId?: string;
    changeNote?: string;
  }): Promise<PromptDefinition> {
    if (!BUILTIN_PROMPTS[input.key]) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Prompt tidak dikenal.');
    }
    if (input.template.trim().length === 0) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Prompt tidak boleh kosong.');
    }

    const latest = await this.prisma.aiPromptVersion.findFirst({
      where: { key: input.key },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    // Never collides with a built-in version number, so a label always points
    // at exactly one set of instructions.
    const version = Math.max(latest?.version ?? 0, BUILTIN_PROMPTS[input.key].version) + 1;

    const definition = await this.prisma.$transaction(async (tx) => {
      // The pointer row comes first: versions reference it, so on the very
      // first publish for a key there is otherwise no parent to hang off.
      await tx.aiPrompt.upsert({
        where: { key: input.key },
        update: { activeVersion: version, ...(input.actorId ? { updatedBy: input.actorId } : {}) },
        create: {
          key: input.key,
          activeVersion: version,
          ...(input.actorId ? { updatedBy: input.actorId } : {}),
        },
      });

      await tx.aiPromptVersion.create({
        data: {
          key: input.key,
          version,
          template: input.template,
          ...(input.changeNote ? { changeNote: input.changeNote } : {}),
          ...(input.actorId ? { createdBy: input.actorId } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          ...(input.actorId ? { actorId: input.actorId } : {}),
          action: 'ai_prompt.publish',
          targetType: 'ai_prompt',
          targetId: input.key,
          // Version and note only. The template body lives in its own table;
          // duplicating it here would make the audit log a second, drifting
          // copy of the same text.
          diff: { version, changeNote: input.changeNote ?? null },
        },
      });

      return { key: input.key, version, template: input.template };
    });

    this.cache.delete(input.key);
    return definition;
  }

  /** Points the key back at an earlier revision. No deploy, no data loss. */
  async rollback(input: {
    key: PromptKey;
    version: number;
    actorId?: string;
  }): Promise<PromptDefinition> {
    const target = await this.prisma.aiPromptVersion.findUnique({
      where: { key_version: { key: input.key, version: input.version } },
    });

    if (!target) {
      throw ApiException.notFound('NOT_FOUND', 'Versi prompt tidak ditemukan.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.aiPrompt.update({
        where: { key: input.key },
        data: {
          activeVersion: input.version,
          ...(input.actorId ? { updatedBy: input.actorId } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          ...(input.actorId ? { actorId: input.actorId } : {}),
          action: 'ai_prompt.rollback',
          targetType: 'ai_prompt',
          targetId: input.key,
          diff: { version: input.version },
        },
      });
    });

    this.cache.delete(input.key);
    return { key: input.key, version: target.version, template: target.template };
  }

  /** Revision history for the admin panel (E14-T12). */
  async history(key: PromptKey): Promise<PromptRevision[]> {
    const [prompt, versions] = await Promise.all([
      this.prisma.aiPrompt.findUnique({ where: { key } }),
      this.prisma.aiPromptVersion.findMany({
        where: { key },
        orderBy: { version: 'desc' },
        select: { version: true, changeNote: true, createdAt: true },
      }),
    ]);

    if (versions.length === 0) {
      const builtin = BUILTIN_PROMPTS[key];
      return [
        {
          key,
          version: builtin.version,
          changeNote: 'Built-in default',
          createdAt: new Date(0),
          isActive: true,
        },
      ];
    }

    return versions.map((row) => ({
      key,
      version: row.version,
      changeNote: row.changeNote,
      createdAt: row.createdAt,
      isActive: row.version === prompt?.activeVersion,
    }));
  }

  /** Test and admin-write seam. */
  invalidate(): void {
    this.cache.clear();
  }
}
