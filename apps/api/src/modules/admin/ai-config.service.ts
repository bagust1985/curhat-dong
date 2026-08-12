import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_JSON_CONFIG_KEYS, type PrismaClient } from '@curhat/database';
import type { PromptKey } from '@curhat/ai';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { PromptRegistryService, type PromptRevision } from '../ai/prompt-registry.service.js';
import {
  InvalidThresholdsError,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  REQUIRED_L3,
  SAFETY_THRESHOLDS_KEY,
  SafetyThresholdsService,
  assertValidThresholds,
} from '../safety/safety-thresholds.service.js';
import type { SafetyThresholds } from '../safety/safety-mapping.js';
import { AuditService, type JsonObject } from './audit.service.js';

export interface ThresholdView {
  thresholds: SafetyThresholds;
  /** True when the built-in defaults are in force. */
  isDefault: boolean;
  limits: { min: number; max: number };
  /** Categories the UI must render and may not remove. */
  requiredL3: readonly string[];
  /**
   * Stated in the payload so the panel can explain the bounds rather than just
   * rejecting input, and so nobody has to look for where "off" went.
   */
  note: string;
}

export interface RoutingView {
  routing: Record<string, unknown>;
  isDefault: boolean;
}

/**
 * AI moderation configuration — E14-T12. PRD §18, TECH-SPEC §4.4.
 *
 * Super Admin only (E14-T02), every write audited with a diff, and prompt
 * rollback without a deploy — the three things the task asks for.
 *
 * The fourth is what the UI must *not* offer: any way to switch safety
 * classification off (non-negotiable #1). That is enforced by
 * `assertValidThresholds`, which caps every value below 1.0 and refuses to let
 * a required category disappear. There is no separate "enabled" flag anywhere
 * in this service, so there is nothing for a toggle to bind to.
 */
@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly thresholdsService: SafetyThresholdsService,
    private readonly prompts: PromptRegistryService,
    private readonly audit: AuditService,
  ) {}

  // --- Thresholds ----------------------------------------------------------

  async thresholds(): Promise<ThresholdView> {
    return {
      thresholds: await this.thresholdsService.current(),
      isDefault: await this.thresholdsService.isDefault(),
      limits: { min: MIN_THRESHOLD, max: MAX_THRESHOLD },
      requiredL3: REQUIRED_L3,
      note:
        `Threshold dibatasi ${MIN_THRESHOLD}–${MAX_THRESHOLD}. Tidak ada cara ` +
        'mematikan klasifikasi keselamatan, dan kategori L3 wajib tidak bisa dihapus.',
    };
  }

  /**
   * Replaces the thresholds.
   *
   * The whole map at once rather than per category: levels have to stay ordered
   * relative to each other (L1 ≤ L2 ≤ L3), and a per-category write cannot
   * check that without reading the rest anyway.
   */
  async updateThresholds(input: {
    adminId: string;
    thresholds: SafetyThresholds;
    reason: string;
  }): Promise<ThresholdView> {
    this.requireReason(input.reason);

    try {
      assertValidThresholds(input.thresholds);
    } catch (error) {
      if (error instanceof InvalidThresholdsError) {
        throw ApiException.badRequest('VALIDATION_ERROR', error.message);
      }
      throw error;
    }

    const before = await this.thresholdsService.current();

    await this.prisma.appConfig.upsert({
      where: { key: SAFETY_THRESHOLDS_KEY },
      update: {
        value: input.thresholds as unknown as JsonObject,
        updatedBy: input.adminId,
      },
      create: {
        key: SAFETY_THRESHOLDS_KEY,
        value: input.thresholds as unknown as JsonObject,
        description: 'Safety level thresholds per risk category (E14-T12).',
        updatedBy: input.adminId,
      },
    });

    this.appConfig.invalidate();

    await this.audit.recordChange(
      {
        actorId: input.adminId,
        action: 'admin.ai_config.thresholds_updated',
        targetType: 'app_config',
        targetId: SAFETY_THRESHOLDS_KEY,
      },
      flatten(before),
      flatten(input.thresholds),
    );

    // Loud on purpose: this is the most consequential setting in the product,
    // and a change should be visible in the log without anyone going looking.
    this.logger.warn(
      `safety thresholds changed by admin ${input.adminId}: ${input.reason.trim()}`,
    );

    return this.thresholds();
  }

  /** Back to the built-in defaults, recorded like any other change. */
  async resetThresholds(input: { adminId: string; reason: string }): Promise<ThresholdView> {
    this.requireReason(input.reason);

    const before = await this.thresholdsService.current();
    await this.prisma.appConfig.deleteMany({ where: { key: SAFETY_THRESHOLDS_KEY } });
    this.appConfig.invalidate();

    await this.audit.recordChange(
      {
        actorId: input.adminId,
        action: 'admin.ai_config.thresholds_reset',
        targetType: 'app_config',
        targetId: SAFETY_THRESHOLDS_KEY,
      },
      flatten(before),
      flatten(await this.thresholdsService.current()),
    );

    return this.thresholds();
  }

  // --- Model routing -------------------------------------------------------

  async routing(): Promise<RoutingView> {
    const stored = await this.appConfig.getJson<Record<string, unknown> | null>(
      AI_JSON_CONFIG_KEYS.routing,
      null,
    );

    return { routing: stored ?? {}, isDefault: stored === null };
  }

  /**
   * Updates cheap/advanced model routing.
   *
   * Note what is *not* configurable here: whether safety operations may be
   * degraded. E08-T03 decides the tier for a safety call before it reads the
   * degraded flag at all, so routing config cannot reach that branch — the
   * cost-saving path physically does not run for `assessRisk`.
   */
  async updateRouting(input: {
    adminId: string;
    routing: Record<string, unknown>;
    reason: string;
  }): Promise<RoutingView> {
    this.requireReason(input.reason);

    const before = await this.routing();

    await this.prisma.appConfig.upsert({
      where: { key: AI_JSON_CONFIG_KEYS.routing },
      update: { value: input.routing as JsonObject, updatedBy: input.adminId },
      create: {
        key: AI_JSON_CONFIG_KEYS.routing,
        value: input.routing as JsonObject,
        description: 'Cheap/advanced model routing (E08-T03).',
        updatedBy: input.adminId,
      },
    });

    this.appConfig.invalidate();

    await this.audit.recordChange(
      {
        actorId: input.adminId,
        action: 'admin.ai_config.routing_updated',
        targetType: 'app_config',
        targetId: AI_JSON_CONFIG_KEYS.routing,
      },
      before.routing as JsonObject,
      input.routing as JsonObject,
    );

    return this.routing();
  }

  // --- Prompt versions -----------------------------------------------------

  /** Every revision of a prompt, newest first, for the version selector. */
  async promptHistory(key: PromptKey): Promise<PromptRevision[]> {
    return this.prompts.history(key);
  }

  /**
   * Publishes a new revision.
   *
   * `PromptRegistryService` keeps revisions immutable and moves a pointer
   * (E08-T04), so this is additive: the old text stays readable, which is what
   * makes a rollback a pointer move rather than a restore from memory.
   */
  async publishPrompt(input: {
    adminId: string;
    key: PromptKey;
    template: string;
    changeNote: string;
  }): Promise<{ version: number }> {
    this.requireReason(input.changeNote);

    const published = await this.prompts.publish({
      key: input.key,
      template: input.template,
      changeNote: input.changeNote,
      actorId: input.adminId,
    });

    return { version: published.version };
  }

  /** Moves the active pointer back. No deploy, no data lost. */
  async rollbackPrompt(input: {
    adminId: string;
    key: PromptKey;
    version: number;
    reason: string;
  }): Promise<{ version: number }> {
    this.requireReason(input.reason);

    await this.prompts.rollback({
      key: input.key,
      version: input.version,
      actorId: input.adminId,
    });

    // `rollback` writes its own `ai_prompt.rollback` entry (E08-T04), which
    // records *what* changed. This one records *why* — the reason is the part
    // an incident review actually needs, and the registry's signature has no
    // field for it.
    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.ai_config.prompt_rollback',
      targetType: 'ai_prompt',
      targetId: input.key,
      diff: { version: input.version, reason: input.reason.trim() },
    });

    return { version: input.version };
  }

  /**
   * A diff between two revisions, line by line.
   *
   * Prompt text is the instruction set behind every safety verdict; "what
   * changed" is the first question after a run of odd classifications, and
   * eyeballing two walls of text is how that question goes unanswered.
   */
  async promptDiff(
    key: PromptKey,
    from: number,
    to: number,
  ): Promise<{ from: number; to: number; lines: Array<{ change: 'same' | 'added' | 'removed'; text: string }> }> {
    // Read straight from the version table: `PromptRevision` deliberately
    // carries metadata only, and the diff needs the templates themselves.
    const [fromRevision, toRevision] = await Promise.all([
      this.prisma.aiPromptVersion.findUnique({
        where: { key_version: { key, version: from } },
        select: { template: true },
      }),
      this.prisma.aiPromptVersion.findUnique({
        where: { key_version: { key, version: to } },
        select: { template: true },
      }),
    ]);

    if (!fromRevision || !toRevision) {
      throw ApiException.notFound('NOT_FOUND', 'Versi prompt itu tidak ditemukan.');
    }

    return { from, to, lines: diffLines(fromRevision.template, toRevision.template) };
  }

  private requireReason(reason: string): void {
    if (reason.trim().length < 10) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Perubahan konfigurasi AI wajib punya alasan — ini keputusan yang akan ditinjau.',
      );
    }
  }
}

/**
 * A minimal line diff.
 *
 * Not an LCS: prompts are edited by hand in small blocks, and a set-based
 * comparison reads well enough for "which lines are new". Reaching for a diff
 * library here would add a dependency to render forty lines of text.
 */
export function diffLines(
  before: string,
  after: string,
): Array<{ change: 'same' | 'added' | 'removed'; text: string }> {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  const lines: Array<{ change: 'same' | 'added' | 'removed'; text: string }> = [];

  for (const line of beforeLines) {
    if (!afterSet.has(line)) lines.push({ change: 'removed', text: line });
  }
  for (const line of afterLines) {
    lines.push({ change: beforeSet.has(line) ? 'same' : 'added', text: line });
  }

  return lines;
}

/** `{l3: {self_harm: 0.5}}` → `{"l3.self_harm": 0.5}`, so a diff reads cleanly. */
function flatten(thresholds: SafetyThresholds): JsonObject {
  const flat: JsonObject = {};

  for (const level of ['l1', 'l2', 'l3'] as const) {
    for (const [category, value] of Object.entries(thresholds[level] ?? {})) {
      flat[`${level}.${category}`] = value ?? null;
    }
  }

  return flat;
}
