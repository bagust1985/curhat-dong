import { Module } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { createEmailProvider, type EmailProvider } from '@curhat/notifications';

import { RateLimitService } from '../../common/rate-limit.service.js';
import { ENV } from '../../config/env.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EMAIL_PROVIDER } from './auth.tokens.js';
import { GoogleAuthService } from './google.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { TurnstileService } from './turnstile.service.js';

/**
 * Auth & session — TECH-SPEC §3.1, BAGIAN 5.
 *
 * SessionService and JwtAuthGuard are exported: every other module's guard
 * needs to check that the session behind a token is still live.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    SessionService,
    GoogleAuthService,
    TurnstileService,
    RateLimitService,
    JwtAuthGuard,
    {
      provide: EMAIL_PROVIDER,
      inject: [ENV],
      useFactory: (env: ServerEnv): EmailProvider =>
        createEmailProvider({
          provider: env.EMAIL_PROVIDER,
          nodeEnv: env.NODE_ENV,
          from: env.EMAIL_FROM,
          resendApiKey: env.RESEND_API_KEY,
        }),
    },
  ],
  exports: [SessionService, JwtAuthGuard, RateLimitService],
})
export class AuthModule {}
