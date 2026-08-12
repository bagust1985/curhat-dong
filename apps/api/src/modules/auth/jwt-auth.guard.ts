import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ServerEnv } from '@curhat/config/env/server';
import { verifyAccessToken } from '@curhat/auth';
import type { Request } from 'express';

import { ApiException } from '../../common/api-error.js';
import { ENV } from '../../config/env.config.js';
import { SessionService } from './session.service.js';

export const IS_PUBLIC = 'curhat:isPublic';

/** Marks a route as reachable without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role?: string | undefined;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw ApiException.unauthorized('UNAUTHORIZED', 'Kamu perlu masuk dulu.');
    }
    return request.user;
  },
);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw ApiException.unauthorized('UNAUTHORIZED', 'Kamu perlu masuk dulu.');
    }

    const result = await verifyAccessToken(header.slice(7), this.env.JWT_ACCESS_SECRET);

    if (!result.ok) {
      // Expiry and tampering are reported separately so the client knows
      // whether to refresh or to send the user back to login.
      throw result.reason === 'expired'
        ? ApiException.unauthorized('AUTH_TOKEN_EXPIRED', 'Sesi kamu sudah lewat.')
        : ApiException.unauthorized('AUTH_TOKEN_INVALID', 'Sesi tidak valid. Masuk lagi ya.');
    }

    // A valid signature is not enough: the session may have been revoked by
    // logout-all or a ban, and the token itself stays valid for 15 minutes.
    const active = await this.sessions.isSessionActive(result.claims.sid);
    if (!active) {
      throw ApiException.unauthorized('AUTH_TOKEN_INVALID', 'Sesi sudah berakhir. Masuk lagi ya.');
    }

    request.user = {
      userId: result.claims.sub,
      sessionId: result.claims.sid,
      ...(result.claims.role ? { role: result.claims.role } : {}),
    };

    return true;
  }
}
