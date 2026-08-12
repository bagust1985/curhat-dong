import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import {
  SupportResourcesService,
  type SupportiveIntervention,
} from '../safety/support-resources.service.js';
import { ESCALATION_GUIDANCE } from './listener-guidelines.js';

export interface EscalationResult {
  caseId: string;
  /** Shown to the listener right after they press the button (PRD §11.3). */
  guidance: typeof ESCALATION_GUIDANCE;
  /** Shown to the requester — resources, never a warning. */
  intervention: SupportiveIntervention;
  /** The session stays open. Always. */
  sessionOpen: boolean;
}

/**
 * Listener → moderator escalation — E10-T11, PRD §11.3.
 *
 * The five rules in PRD §11.3 all point the same way, so the code follows:
 * a Critical case is opened, resources reach the requester, the listener gets
 * three sentences of guidance and permission to leave — and nothing closes the
 * session or touches the requester's account.
 *
 * There is no branch here that suspends, mutes, blocks or ends anything.
 * Someone showing signs of crisis is not committing an offence
 * (CLAUDE.md non-negotiable #2).
 */
@Injectable()
export class ListenerEscalateService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly moderation: ModerationService,
    private readonly supportResources: SupportResourcesService,
  ) {}

  async escalate(listenerId: string, sessionId: string): Promise<EscalationResult> {
    const session = await this.prisma.listenerSession.findFirst({
      where: { id: sessionId, listenerId },
      select: { id: true, requesterId: true, endedAt: true, roomId: true },
    });

    if (!session) {
      throw ApiException.notFound('NOT_FOUND', 'Sesi itu nggak ada.');
    }

    await this.prisma.safetyEvent.create({
      data: {
        userId: session.requesterId,
        targetType: 'user',
        targetId: session.requesterId,
        level: 'L3',
        // Vocabulary check: what happened is that help was called, not that
        // somebody was penalised.
        actionTaken: 'listener_escalated',
        resourceShown: { source: 'listener_escalate', sessionId: session.id },
      },
    });

    const caseId = await this.moderation.openCase({
      source: 'listener_escalate',
      queue: 'critical',
      targetType: 'user',
      targetId: session.requesterId,
    });

    return {
      caseId,
      guidance: ESCALATION_GUIDANCE,
      intervention: await this.supportResources.buildIntervention(),
      // Never auto-closed: cutting the conversation at the moment someone is
      // most alone is the failure this rule exists to prevent (PRD §15.5).
      sessionOpen: session.endedAt === null,
    };
  }
}
