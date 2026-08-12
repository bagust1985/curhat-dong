import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { hashIp } from '@curhat/auth';
import type { CookieOptions, Request, Response } from 'express';

import { ApiException } from '../../common/api-error.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ENV } from '../../config/env.config.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  googleAuthSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  type GoogleAuthDto,
  type OtpRequestDto,
  type OtpVerifyDto,
  type RefreshDto,
} from './auth.dto.js';
import { CurrentUser, Public, type AuthenticatedUser } from './jwt-auth.guard.js';
import type { SessionContext, TokenPair } from './session.service.js';

const REFRESH_COOKIE = 'curhat_refresh';
const REFRESH_COOKIE_PATH = '/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  /**
   * Requests an OTP.
   *
   * Always 202 with the same body, whether or not the address has an account.
   * Anything else turns this endpoint into an account-existence oracle, and on
   * this platform merely having an account is sensitive.
   */
  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequestDto,
    @Req() request: Request,
  ): Promise<{ status: 'sent' }> {
    await this.auth.requestOtp(body.email, this.ipHashOf(request), body.turnstileToken);
    return { status: 'sent' };
  }

  @Public()
  @Post('otp/verify')
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<AuthResult, 'refreshToken'> & { refreshToken?: string }> {
    const result = await this.auth.verifyOtp(body.email, body.code, this.contextOf(request, body));
    return this.respondWithTokens(request, response, result);
  }

  @Public()
  @Post('google')
  async google(
    @Body(new ZodValidationPipe(googleAuthSchema)) body: GoogleAuthDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<AuthResult, 'refreshToken'> & { refreshToken?: string }> {
    const result = await this.auth.loginWithGoogle(body.idToken, this.contextOf(request, body));
    return this.respondWithTokens(request, response, result);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<TokenPair, 'refreshToken'> & { refreshToken?: string }> {
    // Web sends it as a cookie, mobile in the body. Cookie wins so a web
    // client cannot be tricked into supplying a token from elsewhere.
    const token = this.refreshCookieOf(request) ?? body.refreshToken;

    if (!token) {
      throw ApiException.unauthorized('AUTH_TOKEN_INVALID', 'Sesi tidak valid. Masuk lagi ya.');
    }

    const tokens = await this.auth.refresh(token, this.contextOf(request, {}));
    return this.respondWithTokens(request, response, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: 'ok' }> {
    await this.auth.logout(user.sessionId);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { status: 'ok' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revokedSessions: number }> {
    const result = await this.auth.logoutAll(user.userId);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return result;
  }

  // -------------------------------------------------------------------------

  /**
   * Web gets the refresh token as an HttpOnly cookie and never sees it in JS;
   * mobile gets it in the body and stores it in Expo SecureStore.
   *
   * TECH-SPEC §5.1 forbids localStorage, so the token is deliberately withheld
   * from the response body for browser clients — there is nowhere safe for a
   * web client to put it.
   */
  private respondWithTokens<T extends TokenPair>(
    request: Request,
    response: Response,
    tokens: T,
  ): Omit<T, 'refreshToken'> & { refreshToken?: string } {
    const { refreshToken, ...rest } = tokens;

    if (this.isBrowserClient(request)) {
      response.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
      return rest;
    }

    return { ...rest, refreshToken };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
  }

  private refreshCookieOf(request: Request): string | undefined {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_COOKIE];
  }

  /**
   * Mobile identifies itself with `X-Client-Platform: mobile`.
   *
   * Defaults to browser: getting this wrong towards "browser" means a mobile
   * client gets a cookie it ignores, while getting it wrong the other way puts
   * a refresh token into a page's JavaScript.
   */
  private isBrowserClient(request: Request): boolean {
    return request.header('x-client-platform') !== 'mobile';
  }

  private contextOf(request: Request, body: { deviceId?: string | undefined }): SessionContext {
    return {
      ipHash: this.ipHashOf(request),
      deviceId: body.deviceId,
      userAgent: request.header('user-agent'),
    };
  }

  private ipHashOf(request: Request): string {
    return hashIp(request.ip ?? 'unknown', this.env.TOKEN_ENCRYPTION_KEY);
  }
}
