import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiResponse, ErrorCode } from '@curhat/types';
import type { Request, Response } from 'express';

import { ApiException } from './api-error.js';

interface NestErrorBody {
  code?: string;
  message?: string | string[];
  details?: Record<string, string[]>;
}

/**
 * Turns every thrown error into the standard envelope.
 *
 * Two rules matter here:
 *  - an unexpected error never leaks a stack trace or internal message to the
 *    client (TECH-SPEC §3);
 *  - the log line never includes the request body, because on this product the
 *    body is somebody's curhat (CLAUDE.md non-negotiable #3).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalise(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Method and path only — no body, no query, no headers.
      this.logger.error(
        `${request.method} ${request.path} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiResponse<never> = {
      data: null,
      meta: {},
      error: { code, message, ...(details ? { details } : {}) },
    };

    response.status(status).json(body);
  }

  private normalise(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
  } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: this.messageOf(exception),
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as NestErrorBody | string;
      const parsed = typeof body === 'string' ? { message: body } : body;

      return {
        status,
        code: this.codeForStatus(status),
        message: Array.isArray(parsed.message)
          ? parsed.message.join(', ')
          : (parsed.message ?? 'Terjadi kesalahan.'),
        ...(parsed.details ? { details: parsed.details } : {}),
      };
    }

    // Unknown failure: say nothing specific. The detail is in the server log.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Ada yang error di sisi kami. Coba lagi sebentar lagi ya.',
    };
  }

  private messageOf(exception: ApiException): string {
    const body = exception.getResponse() as NestErrorBody;
    const message = body.message;
    if (Array.isArray(message)) return message.join(', ');
    return message ?? 'Terjadi kesalahan.';
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
