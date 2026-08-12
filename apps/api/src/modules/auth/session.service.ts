import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient } from '@curhat/database';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  generateOpaqueToken,
  generateTokenFamilyId,
  hashToken,
  signAccessToken,
} from '@curhat/auth';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { ENV } from '../../config/env.config.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionContext {
  deviceId?: string | undefined;
  ipHash?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Refresh-token sessions with rotation and reuse detection — TECH-SPEC §5.1.
 *
 * The rule: every refresh mints a new token and revokes the old one. If a
 * token that was already rotated is presented again, either it leaked or it
 * was replayed — and there is no way to tell which. So the entire family is
 * revoked and the user has to log in again. Losing a session is a much smaller
 * harm than leaving a stolen token working.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  async issue(userId: string, context: SessionContext = {}): Promise<TokenPair> {
    const familyId = generateTokenFamilyId();
    return this.mint(userId, familyId, context);
  }

  /**
   * Rotates a refresh token.
   *
   * The revoke-and-mint runs inside one transaction so two concurrent refreshes
   * cannot both succeed — the second finds the row already revoked and is
   * treated as reuse.
   */
  async rotate(refreshToken: string, context: SessionContext = {}): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken, this.env.TOKEN_ENCRYPTION_KEY);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
    });

    if (!session) {
      throw ApiException.unauthorized('AUTH_TOKEN_INVALID', 'Sesi tidak valid. Masuk lagi ya.');
    }

    if (session.revokedAt) {
      // An already-rotated token came back. Revoke the whole family: we cannot
      // distinguish a stolen token from a replayed one, and guessing wrong in
      // the permissive direction leaves an attacker logged in.
      await this.revokeFamily(session.familyId, 'refresh token reuse detected');

      this.logger.warn(
        `refresh token reuse detected for family ${session.familyId}; family revoked`,
      );

      throw ApiException.unauthorized(
        'AUTH_REFRESH_REUSE_DETECTED',
        'Ada aktivitas mencurigakan di akunmu. Demi keamanan, masuk lagi ya.',
      );
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw ApiException.unauthorized('AUTH_TOKEN_EXPIRED', 'Sesi sudah berakhir. Masuk lagi ya.');
    }

    const rotated = await this.prisma.userSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (rotated.count === 0) {
      // Lost the race against a concurrent refresh of the same token. The
      // winner already rotated it, so this one is reuse.
      await this.revokeFamily(session.familyId, 'concurrent refresh of the same token');
      throw ApiException.unauthorized(
        'AUTH_REFRESH_REUSE_DETECTED',
        'Ada aktivitas mencurigakan di akunmu. Demi keamanan, masuk lagi ya.',
      );
    }

    return this.mint(session.userId, session.familyId, context);
  }

  /** Revokes one session — used by logout. */
  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every session for a user — logout-all, ban, password reset. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * True when the session behind an access token is still valid.
   *
   * Checked on every authenticated request: without it a logged-out user keeps
   * a working access token for up to fifteen minutes.
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true },
    });

    if (!session) return false;
    if (session.revokedAt) return false;
    return session.expiresAt.getTime() > Date.now();
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    const result = await this.prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.warn(`revoked ${result.count} session(s) in family ${familyId}: ${reason}`);
    }
  }

  private async mint(
    userId: string,
    familyId: string,
    context: SessionContext,
  ): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();

    const session = await this.prisma.userSession.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: hashToken(refreshToken, this.env.TOKEN_ENCRYPTION_KEY),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        ...(context.deviceId ? { deviceId: context.deviceId } : {}),
        ...(context.ipHash ? { ipHash: context.ipHash } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent.slice(0, 255) } : {}),
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { adminRole: true },
    });

    const accessToken = await signAccessToken(
      {
        sub: userId,
        sid: session.id,
        ...(user.adminRole ? { role: user.adminRole } : {}),
      },
      this.env.JWT_ACCESS_SECRET,
    );

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
