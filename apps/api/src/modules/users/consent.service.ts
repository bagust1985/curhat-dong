import { Inject, Injectable } from '@nestjs/common';
import type { ConsentType, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';

/**
 * Consent records — PRD §25.3, TECH-SPEC §18.1.
 *
 * Three consents, recorded separately:
 *   - `tos_privacy`          required
 *   - `sensitive_processing` required
 *   - `analytics`            OPTIONAL
 *
 * Bundling them into one checkbox invalidates the consent, so the split is
 * enforced here rather than left to the UI.
 */

export const REQUIRED_CONSENTS: readonly ConsentType[] = ['tos_privacy', 'sensitive_processing'];
export const OPTIONAL_CONSENTS: readonly ConsentType[] = ['analytics'];

/**
 * Bump when the wording changes materially. A new version means consent is
 * asked again — an old agreement does not cover new terms.
 */
export const CURRENT_DOCUMENT_VERSION = '2026-08-12';

export interface ConsentState {
  consentType: ConsentType;
  granted: boolean;
  required: boolean;
  documentVersion: string;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class ConsentService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async stateFor(userId: string): Promise<ConsentState[]> {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId, documentVersion: CURRENT_DOCUMENT_VERSION },
    });

    const byType = new Map(records.map((record) => [record.consentType, record]));

    return [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS].map((consentType) => {
      const record = byType.get(consentType);
      return {
        consentType,
        granted: record?.granted === true && record.revokedAt === null,
        required: REQUIRED_CONSENTS.includes(consentType),
        documentVersion: CURRENT_DOCUMENT_VERSION,
        grantedAt: record?.grantedAt ?? null,
        revokedAt: record?.revokedAt ?? null,
      };
    });
  }

  /**
   * Records consent decisions.
   *
   * A refusal is stored too, not skipped: "they said no" is as much a
   * compliance record as "they said yes".
   */
  async record(
    userId: string,
    decisions: Array<{ consentType: ConsentType; granted: boolean }>,
    method: 'onboarding' | 'settings' | 'reconsent' = 'onboarding',
  ): Promise<void> {
    for (const decision of decisions) {
      await this.prisma.consentRecord.upsert({
        where: {
          userId_consentType_documentVersion: {
            userId,
            consentType: decision.consentType,
            documentVersion: CURRENT_DOCUMENT_VERSION,
          },
        },
        update: {
          granted: decision.granted,
          method,
          // Revocation sets a timestamp; the row is never deleted, because the
          // history is the evidence.
          revokedAt: decision.granted ? null : new Date(),
        },
        create: {
          userId,
          consentType: decision.consentType,
          documentVersion: CURRENT_DOCUMENT_VERSION,
          granted: decision.granted,
          method,
          ...(decision.granted ? {} : { revokedAt: new Date() }),
        },
      });
    }
  }

  /**
   * Rejects an operation when a required consent is missing.
   *
   * Only ever called with the two required types. Analytics is deliberately
   * outside this check: gating any feature on it would make it non-optional in
   * practice, which is the thing PRD §25.3 forbids.
   */
  async assertRequiredConsents(userId: string): Promise<void> {
    const state = await this.stateFor(userId);
    const missing = state.filter((entry) => entry.required && !entry.granted);

    if (missing.length > 0) {
      throw ApiException.forbidden(
        'CONSENT_REQUIRED',
        'Kamu perlu menyetujui syarat layanan dan kebijakan privasi dulu.',
      );
    }
  }

  /**
   * True when this user agreed to analytics.
   *
   * The only correct use is deciding whether to record an analytics event.
   * Using it to withhold a feature would make the consent compulsory.
   */
  async hasAnalyticsConsent(userId: string): Promise<boolean> {
    const record = await this.prisma.consentRecord.findUnique({
      where: {
        userId_consentType_documentVersion: {
          userId,
          consentType: 'analytics',
          documentVersion: CURRENT_DOCUMENT_VERSION,
        },
      },
    });

    return record?.granted === true && record.revokedAt === null;
  }

  /** True when the user has not yet agreed to the current document version. */
  async needsReconsent(userId: string): Promise<boolean> {
    const state = await this.stateFor(userId);
    return state.some((entry) => entry.required && !entry.granted);
  }
}
