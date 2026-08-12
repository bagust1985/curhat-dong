import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@curhat/types';

/**
 * The only way to raise a client-facing error.
 *
 * Every error carries a stable `code` (TECH-SPEC §3) so clients branch on the
 * code and never on the Indonesian message, which is copy and will change.
 */
export class ApiException extends HttpException {
  readonly code: ErrorCode;
  readonly details: Record<string, string[]> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    status: HttpStatus,
    details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }

  static badRequest(code: ErrorCode, message: string, details?: Record<string, string[]>) {
    return new ApiException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.FORBIDDEN);
  }

  static notFound(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.CONFLICT);
  }

  static tooManyRequests(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.TOO_MANY_REQUESTS);
  }

  static unavailable(code: ErrorCode, message: string) {
    return new ApiException(code, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
