import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import type { UpdateProfileDto } from '../auth/auth.dto.js';

/**
 * Everything a public API response is allowed to contain about a user
 * (PRD §16). Anything not on this type must not leave the server.
 */
export interface PublicProfile {
  alias: string;
  avatar: string | null;
  bio: string | null;
  isListener: boolean;
  joinedAt: Date;
  helpfulCount: number;
}

/** Own view: the public shape plus fields only the owner may see. */
export interface OwnProfile extends PublicProfile {
  hasCompletedOnboarding: boolean;
  topics: string[];
}

/**
 * The exact Prisma selection for a public profile.
 *
 * Written as an explicit allow-list rather than by omitting fields: a new
 * column on `user_profiles` should not become visible to the world just
 * because nobody remembered to exclude it (CLAUDE.md non-negotiable #4).
 */
const PUBLIC_PROFILE_SELECT = {
  alias: true,
  avatar: true,
  bio: true,
  isListener: true,
  joinedAt: true,
  helpfulCount: true,
} as const;

@Injectable()
export class UsersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async getOwnProfile(userId: string): Promise<OwnProfile | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { ...PUBLIC_PROFILE_SELECT, topics: true },
    });

    if (!profile) return null;

    return { ...profile, topics: profile.topics, hasCompletedOnboarding: true };
  }

  async getPublicProfile(alias: string, viewerId: string): Promise<PublicProfile> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { aliasLower: alias.toLowerCase() },
      select: { ...PUBLIC_PROFILE_SELECT, userId: true },
    });

    if (!profile) {
      throw ApiException.notFound('NOT_FOUND', 'Profil tidak ditemukan.');
    }

    // A blocked pair must be invisible to each other in both directions
    // (PRD §15). 404 rather than 403: telling someone they have been blocked
    // is itself information they are not owed.
    if (await this.isBlockedEitherWay(viewerId, profile.userId)) {
      throw ApiException.notFound('NOT_FOUND', 'Profil tidak ditemukan.');
    }

    const { userId: _userId, ...publicFields } = profile;
    return publicFields;
  }

  async updateOwnProfile(userId: string, input: UpdateProfileDto): Promise<OwnProfile> {
    if (input.alias) {
      const taken = await this.prisma.userProfile.findFirst({
        where: { aliasLower: input.alias.toLowerCase(), NOT: { userId } },
        select: { userId: true },
      });

      if (taken) {
        throw ApiException.conflict('ALIAS_TAKEN', 'Alias itu sudah dipakai. Coba yang lain ya.');
      }
    }

    const profile = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(input.alias ? { alias: input.alias, aliasLower: input.alias.toLowerCase() } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
      },
      select: { ...PUBLIC_PROFILE_SELECT, topics: true },
    });

    return { ...profile, hasCompletedOnboarding: true };
  }

  // --- Block (PRD §15) -----------------------------------------------------

  async block(blockerId: string, blockedAlias: string): Promise<void> {
    const target = await this.prisma.userProfile.findUnique({
      where: { aliasLower: blockedAlias.toLowerCase() },
      select: { userId: true },
    });

    if (!target) {
      throw ApiException.notFound('NOT_FOUND', 'Profil tidak ditemukan.');
    }

    if (target.userId === blockerId) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Kamu nggak bisa blokir diri sendiri.');
    }

    // Idempotent: blocking twice is not an error the user should have to think
    // about.
    await this.prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId: target.userId } },
      update: {},
      create: { blockerId, blockedId: target.userId },
    });
  }

  async unblock(blockerId: string, blockedAlias: string): Promise<void> {
    const target = await this.prisma.userProfile.findUnique({
      where: { aliasLower: blockedAlias.toLowerCase() },
      select: { userId: true },
    });

    if (!target) return;

    await this.prisma.blockedUser.deleteMany({
      where: { blockerId, blockedId: target.userId },
    });
  }

  async listBlocked(blockerId: string): Promise<Array<{ alias: string; blockedAt: Date }>> {
    const blocks = await this.prisma.blockedUser.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
    });

    if (blocks.length === 0) return [];

    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: blocks.map((b) => b.blockedId) } },
      select: { userId: true, alias: true },
    });

    const aliasByUserId = new Map(profiles.map((p) => [p.userId, p.alias]));

    return blocks
      .map((block) => {
        const alias = aliasByUserId.get(block.blockedId);
        return alias ? { alias, blockedAt: block.createdAt } : null;
      })
      .filter((entry): entry is { alias: string; blockedAt: Date } => entry !== null);
  }

  /**
   * True when either user has blocked the other.
   *
   * Blocking is one-directional as data but two-directional in effect
   * (PRD §15): the blocked user must not be able to see the blocker either,
   * or blocking would just tell someone they have been blocked.
   */
  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    if (a === b) return false;

    const block = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });

    return block !== null;
  }

  /** Bulk variant for feed and comment filtering. */
  async blockedUserIdsFor(userId: string): Promise<string[]> {
    const blocks = await this.prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });

    const ids = new Set<string>();
    for (const block of blocks) {
      ids.add(block.blockerId === userId ? block.blockedId : block.blockerId);
    }
    return [...ids];
  }
}
