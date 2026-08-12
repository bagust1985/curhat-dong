import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

import { ApiException } from '../../common/api-error.js';
import { ENV } from '../../config/env.config.js';

export interface GoogleIdentity {
  /** Google `sub` — stable per account, never exposed publicly (PRD §20). */
  providerId: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Google sign-in — TECH-SPEC §5.3.
 *
 * Verification runs through Google's own library, which fetches and caches
 * their JWKS and checks the signature, issuer and audience. Decoding the token
 * and trusting its contents would let anyone log in as anyone: the payload is
 * just base64, and the signature is the only thing that makes it an assertion
 * rather than a claim.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client: OAuth2Client;

  constructor(@Inject(ENV) private readonly env: ServerEnv) {
    this.client = new OAuth2Client(this.env.GOOGLE_CLIENT_ID);
  }

  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        // A token minted for a different app is a perfectly valid Google token
        // and must still not log anyone in here.
        audience: this.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // Reason logged, never returned: a precise error tells an attacker which
      // part of their forgery to fix.
      this.logger.warn(`Google ID token rejected: ${(error as Error).message}`);
      throw ApiException.unauthorized(
        'AUTH_GOOGLE_TOKEN_INVALID',
        'Login Google gagal. Coba lagi ya.',
      );
    }

    if (!payload?.sub || !payload.email) {
      throw ApiException.unauthorized(
        'AUTH_GOOGLE_TOKEN_INVALID',
        'Login Google gagal. Coba lagi ya.',
      );
    }

    if (payload.email_verified !== true) {
      // An unverified Google address may belong to someone else. Linking it
      // would hand them an existing CURHAT DONG account.
      throw ApiException.unauthorized(
        'AUTH_GOOGLE_TOKEN_INVALID',
        'Email Google kamu belum terverifikasi.',
      );
    }

    return {
      providerId: payload.sub,
      email: payload.email,
      emailVerified: true,
    };
  }
}
