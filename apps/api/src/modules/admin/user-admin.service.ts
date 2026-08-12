import { Inject, Injectable } from '@nestjs/common';
import { hashEmail } from '@curhat/auth';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient, SafetyLevel, UserStatus } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { ENV } from '../../config/env.config.js';
import { SessionService } from '../auth/session.service.js';
import { NotificationFanoutService } from '../notifications/notification-fanout.service.js';
import { AuditService } from './audit.service.js';

export interface UserSummary {
  userId: string;
  alias: string | null;
  status: UserStatus;
  isListener: boolean;
  joinedAt: Date | null;
  /** Internal only — visible to admins, never on a public API. */
  trustScore: number;
}

export interface UserDetail extends UserSummary {
  ageDeclaredAt: Date | null;
  deletedAt: Date | null;

  /** Levels and dates. Never the content that produced them. */
  safetyHistory: Array<{ level: SafetyLevel; actionTaken: string | null; createdAt: Date }>;

  moderationHistory: Array<{
    actionId: string;
    action: string;
    reason: string;
    durationHours: number | null;
    createdAt: Date;
    appealed: boolean;
  }>;

  reportsAgainst: number;
  reportsFiled: number;

  /** Device shape only — the push token never leaves the server. */
  devices: Array<{ platform: string; pushProvider: string; lastSeen: Date; disabled: boolean }>;

  listenerSessions: { asListener: number; asRequester: number };
  activeSessions: number;
}

export type UserAdminAction = 'warn' | 'mute' | 'suspend' | 'ban' | 'unban';

/**
 * User management — E14-T08. PRD §18, DESIGN-REF §3.4.
 *
 * Search is by alias, internal id, or **email hash** — never plaintext email,
 * because plaintext email is not stored (TECH-SPEC §7.5). Support staff paste
 * an address, the server hashes it with the same key the auth flow uses, and
 * looks that up. The address itself is never written down, logged, or held in
 * memory beyond the request.
 */
@Injectable()
export class UserAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly sessions: SessionService,
    private readonly notifications: NotificationFanoutService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Finds accounts.
   *
   * `query` is matched as an alias, a uuid, or an email — an email is hashed
   * before it touches the database, so "search by email" works without the
   * platform ever being able to search *for* an email.
   */
  async search(
    filter: { query?: string | undefined; status?: UserStatus | undefined; limit?: number },
  ): Promise<UserSummary[]> {
    const limit = filter.limit ?? 25;
    const query = filter.query?.trim();

    const userIds = query ? await this.resolveQuery(query) : null;

    const users = await this.prisma.user.findMany({
      where: {
        ...(userIds ? { id: { in: userIds } } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        trustScoreInternal: true,
        profile: { select: { alias: true, isListener: true, joinedAt: true } },
      },
    });

    return users.map((user) => ({
      userId: user.id,
      alias: user.profile?.alias ?? null,
      status: user.status,
      isListener: user.profile?.isListener ?? false,
      joinedAt: user.profile?.joinedAt ?? null,
      trustScore: user.trustScoreInternal,
    }));
  }

  /**
   * Turns a search term into candidate user ids.
   *
   * An email is recognised by shape and hashed. Nothing else here can reach an
   * address: `auth_accounts` stores `email_hash`, and the encrypted copy is
   * never queried by this path.
   */
  private async resolveQuery(query: string): Promise<string[]> {
    if (UUID_PATTERN.test(query)) return [query];

    if (query.includes('@')) {
      const account = await this.prisma.authAccount.findFirst({
        where: { emailHash: hashEmail(query, this.env.TOKEN_ENCRYPTION_KEY) },
        select: { userId: true },
      });
      return account ? [account.userId] : [];
    }

    // A raw hash, pasted from an export or another admin screen.
    if (/^[0-9a-f]{64}$/i.test(query)) {
      const account = await this.prisma.authAccount.findFirst({
        where: { emailHash: query.toLowerCase() },
        select: { userId: true },
      });
      return account ? [account.userId] : [];
    }

    const profiles = await this.prisma.userProfile.findMany({
      where: { aliasLower: { contains: query.toLowerCase() } },
      take: 25,
      select: { userId: true },
    });
    return profiles.map((profile) => profile.userId);
  }

  async detail(userId: string, adminId: string): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        trustScoreInternal: true,
        ageDeclaredAt: true,
        deletedAt: true,
        profile: { select: { alias: true, isListener: true, joinedAt: true } },
        devices: {
          select: {
            platform: true,
            pushProvider: true,
            lastSeen: true,
            disabledAt: true,
          },
        },
      },
    });

    if (!user) {
      throw ApiException.notFound('NOT_FOUND', 'Akun itu tidak ditemukan.');
    }

    const [safetyHistory, moderationHistory, reportsAgainst, reportsFiled, asListener, asRequester, activeSessions] =
      await Promise.all([
        this.prisma.safetyEvent.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { level: true, actionTaken: true, createdAt: true },
        }),
        this.prisma.moderationAction.findMany({
          where: { targetUserId: userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            action: true,
            reason: true,
            durationHours: true,
            createdAt: true,
            appealed: true,
          },
        }),
        this.prisma.report.count({ where: { targetType: 'user', targetId: userId } }),
        this.prisma.report.count({ where: { reporterId: userId } }),
        this.prisma.listenerSession.count({ where: { listenerId: userId } }),
        this.prisma.listenerSession.count({ where: { requesterId: userId } }),
        this.prisma.userSession.count({ where: { userId, revokedAt: null } }),
      ]);

    // Opening an account record is a look at somebody's history. Recorded like
    // every other privileged read (PRD §25.6).
    await this.audit.record({
      actorId: adminId,
      action: 'admin.user.viewed',
      targetType: 'user',
      targetId: userId,
    });

    return {
      userId: user.id,
      alias: user.profile?.alias ?? null,
      status: user.status,
      isListener: user.profile?.isListener ?? false,
      joinedAt: user.profile?.joinedAt ?? null,
      trustScore: user.trustScoreInternal,
      ageDeclaredAt: user.ageDeclaredAt,
      deletedAt: user.deletedAt,
      safetyHistory,
      moderationHistory: moderationHistory.map((action) => ({
        actionId: action.id,
        action: action.action,
        reason: action.reason,
        durationHours: action.durationHours,
        createdAt: action.createdAt,
        appealed: action.appealed,
      })),
      reportsAgainst,
      reportsFiled,
      devices: user.devices.map((device) => ({
        platform: device.platform,
        pushProvider: device.pushProvider,
        lastSeen: device.lastSeen,
        disabled: device.disabledAt !== null,
      })),
      listenerSessions: { asListener, asRequester },
      activeSessions,
    };
  }

  /**
   * Acts on an account directly, outside a moderation case.
   *
   * Kept separate from `CaseDetailService.apply` on purpose: that path resolves
   * the target *from* a case and closes it. This one is the "user detail page"
   * action, where a support lead is looking at an account rather than at a
   * piece of content — and it is deliberately the narrower of the two, with no
   * content effects at all.
   */
  async act(input: {
    userId: string;
    adminId: string;
    action: UserAdminAction;
    reason: string;
    durationHours?: number | undefined;
  }): Promise<{ status: UserStatus }> {
    const reason = input.reason.trim();

    if (reason.length < 10) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Alasan wajib diisi dan cukup jelas untuk ditinjau saat banding.',
      );
    }

    if ((input.action === 'mute' || input.action === 'suspend') && !input.durationHours) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Mute dan suspend wajib punya durasi.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { status: true },
    });

    if (!user) {
      throw ApiException.notFound('NOT_FOUND', 'Akun itu tidak ditemukan.');
    }

    const nextStatus = STATUS_FOR[input.action] ?? user.status;

    await this.prisma.user.update({
      where: { id: input.userId },
      data: { status: nextStatus },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: `admin.user.${input.action}`,
      targetType: 'user',
      targetId: input.userId,
      diff: {
        action: input.action,
        reason,
        from: user.status,
        to: nextStatus,
        ...(input.durationHours ? { durationHours: input.durationHours } : {}),
      },
    });

    // A suspension that waits for a token to expire is not a suspension.
    if (input.action === 'suspend' || input.action === 'ban') {
      await this.sessions.revokeAllForUser(input.userId);
    }

    await this.notifications
      .notify({
        userId: input.userId,
        template: 'account.moderation_action',
        dedupeKey: `user_action:${input.userId}:${Date.now()}`,
      })
      .catch(() => undefined);

    return { status: nextStatus };
  }
}

/**
 * The account status each action produces.
 *
 * `warn` is absent on purpose: a warning is recorded and shown, and changes no
 * state. Making it a status would turn "we told you" into a punishment nobody
 * decided to apply.
 */
const STATUS_FOR: Partial<Record<UserAdminAction, UserStatus>> = {
  mute: 'muted',
  suspend: 'suspended',
  ban: 'banned',
  unban: 'active',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
