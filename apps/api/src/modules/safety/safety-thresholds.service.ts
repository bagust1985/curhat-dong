import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../common/app-config.service.js';
import { DEFAULT_THRESHOLDS, type SafetyThresholds } from './safety-mapping.js';

/** The `app_configs` row holding the live thresholds (E14-T12). */
export const SAFETY_THRESHOLDS_KEY = 'safety.thresholds';

/**
 * The ceiling on any threshold.
 *
 * This is the line that stops the config from becoming an off switch
 * (CLAUDE.md non-negotiable #1). A threshold of 1.0 means "only fire when the
 * model is certain", which in practice never happens — safety would be disabled
 * without anyone having written the word "disable" anywhere.
 */
export const MAX_THRESHOLD = 0.95;

/** The floor. Zero would hold every post ever written. */
export const MIN_THRESHOLD = 0.05;

/**
 * Categories that must exist at L3.
 *
 * Removing a category is the other way to switch safety off — a category with
 * no threshold is never evaluated, because `categoriesAtOrAbove` iterates the
 * thresholds rather than the scores.
 */
export const REQUIRED_L3 = ['self_harm', 'threat', 'violence', 'sexual'] as const;

export class InvalidThresholdsError extends Error {}

/**
 * The live safety thresholds — E14-T12, read side.
 *
 * Lives in the safety module rather than the admin module on purpose: the
 * safety engine needs it on every classification, and pointing the engine at an
 * admin service would make `SafetyModule` depend on `AdminModule`, which
 * already depends (through chat) on `SafetyModule`.
 *
 * E07 wrote `mapRiskToSafetyLevel` as a pure function taking thresholds as an
 * argument. That is what makes this possible without touching the decision
 * logic at all.
 */
@Injectable()
export class SafetyThresholdsService {
  private readonly logger = new Logger(SafetyThresholdsService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  /**
   * What the engine should use right now.
   *
   * No row means the built-in defaults, so a fresh install classifies correctly
   * before anybody opens the admin panel — the same choice E08-T04 made for
   * prompts.
   *
   * A stored row that fails validation is *ignored*. If somebody wrote a bad
   * value straight into the database, the safe answer is the defaults, not
   * whatever the row happens to say.
   */
  async current(): Promise<SafetyThresholds> {
    const stored = await this.appConfig.getJson<SafetyThresholds | null>(
      SAFETY_THRESHOLDS_KEY,
      null,
    );

    if (!stored) return DEFAULT_THRESHOLDS;

    try {
      assertValidThresholds(stored);
      return stored;
    } catch (error) {
      this.logger.error(
        'stored safety thresholds are invalid; falling back to built-in defaults',
        error,
      );
      return DEFAULT_THRESHOLDS;
    }
  }

  /** True when no row exists and the defaults are in force. */
  async isDefault(): Promise<boolean> {
    return (
      (await this.appConfig.getJson<SafetyThresholds | null>(SAFETY_THRESHOLDS_KEY, null)) === null
    );
  }
}

/**
 * Every rule a threshold map has to satisfy.
 *
 * Throws `InvalidThresholdsError` rather than an HTTP exception so it can be
 * used on the read path without dragging the web layer into the safety engine;
 * the admin service translates it.
 */
export function assertValidThresholds(thresholds: SafetyThresholds): void {
  for (const level of ['l1', 'l2', 'l3'] as const) {
    const map = thresholds[level];

    if (!map || typeof map !== 'object' || Object.keys(map).length === 0) {
      throw new InvalidThresholdsError(
        `Threshold untuk ${level.toUpperCase()} tidak boleh kosong.`,
      );
    }

    for (const [category, value] of Object.entries(map)) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new InvalidThresholdsError(`Threshold ${level}.${category} harus berupa angka.`);
      }
      if (value > MAX_THRESHOLD) {
        throw new InvalidThresholdsError(
          `Threshold ${level}.${category} tidak boleh di atas ${MAX_THRESHOLD} — ` +
            'itu sama dengan mematikan deteksi kategori ini.',
        );
      }
      if (value < MIN_THRESHOLD) {
        throw new InvalidThresholdsError(
          `Threshold ${level}.${category} tidak boleh di bawah ${MIN_THRESHOLD}.`,
        );
      }
    }
  }

  for (const category of REQUIRED_L3) {
    if (!(category in thresholds.l3)) {
      throw new InvalidThresholdsError(
        `Kategori ${category} wajib ada di L3 dan tidak bisa dihapus.`,
      );
    }
  }

  // Levels must stay ordered per category, or a post could trip L3 without
  // tripping L2 and the highest-first evaluation would report a wrong level.
  for (const category of Object.keys(thresholds.l3)) {
    const l3 = thresholds.l3[category];
    const l2 = thresholds.l2[category];
    const l1 = thresholds.l1[category];

    if (l2 !== undefined && l3 !== undefined && l2 > l3) {
      throw new InvalidThresholdsError(
        `Threshold L2 untuk ${category} tidak boleh lebih tinggi dari L3.`,
      );
    }
    if (l1 !== undefined && l2 !== undefined && l1 > l2) {
      throw new InvalidThresholdsError(
        `Threshold L1 untuk ${category} tidak boleh lebih tinggi dari L2.`,
      );
    }
  }

  /**
   * The asymmetry E07 built in, kept as a rule rather than a comment.
   *
   * A false positive on self-harm means somebody sees a support message they
   * did not need. A false negative means a crisis signal passes unnoticed.
   * Those costs are not comparable, so `self_harm` must *stay* the most
   * sensitive L3 category — not merely start out that way.
   */
  const selfHarm = thresholds.l3['self_harm'];
  for (const [category, value] of Object.entries(thresholds.l3)) {
    if (category === 'self_harm') continue;
    if (selfHarm !== undefined && value !== undefined && selfHarm > value) {
      throw new InvalidThresholdsError(
        `Threshold self_harm harus tetap paling sensitif — sekarang lebih tinggi dari ${category}.`,
      );
    }
  }
}
