import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { ApiResponse } from '@curhat/types';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { ApiException } from './api-error.js';
import { ResponseInterceptor, withMeta } from './response.interceptor.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

function mockHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', path: '/v1/posts' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

function captured(json: ReturnType<typeof vi.fn>): ApiResponse<never> {
  return json.mock.calls[0]?.[0] as ApiResponse<never>;
}

describe('ResponseInterceptor', () => {
  it('wraps a plain value in the standard envelope', async () => {
    const interceptor = new ResponseInterceptor<{ id: string }>();
    const result = await firstValueFrom(
      interceptor.intercept({} as ArgumentsHost as never, { handle: () => of({ id: 'p1' }) }),
    );

    expect(result).toEqual({ data: { id: 'p1' }, meta: {}, error: null });
  });

  it('carries pagination meta through', async () => {
    const interceptor = new ResponseInterceptor<unknown>();
    const result = await firstValueFrom(
      interceptor.intercept({} as ArgumentsHost as never, {
        handle: () => of(withMeta([1, 2], { nextCursor: 'abc' })),
      }),
    );

    expect(result.meta.nextCursor).toBe('abc');
    expect(result.error).toBeNull();
  });
});

describe('AllExceptionsFilter', () => {
  it('preserves the stable code from ApiException', () => {
    const { host, status, json } = mockHost();

    new AllExceptionsFilter().catch(
      ApiException.tooManyRequests('RATE_LIMITED', 'Sabar dulu ya.'),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(captured(json).error?.code).toBe('RATE_LIMITED');
    expect(captured(json).data).toBeNull();
  });

  it('maps a bare HttpException to a stable code', () => {
    const { host, json } = mockHost();

    new AllExceptionsFilter().catch(new HttpException('nope', HttpStatus.FORBIDDEN), host);

    expect(captured(json).error?.code).toBe('FORBIDDEN');
  });

  it('never leaks an internal error message to the client', () => {
    const { host, status, json } = mockHost();
    const secret = 'connection string postgres://user:hunter2@db';

    new AllExceptionsFilter().catch(new Error(secret), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = captured(json);
    expect(body.error?.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('postgres://');
  });

  it('always returns the envelope shape', () => {
    const { host, json } = mockHost();

    new AllExceptionsFilter().catch(new Error('boom'), host);

    const body = captured(json);
    expect(Object.keys(body).sort()).toEqual(['data', 'error', 'meta']);
  });
});

describe('ZodValidationPipe', () => {
  const schema = z.object({
    body: z.string().min(1),
    mood: z.enum(['sedih', 'senang']),
  });

  it('returns parsed data when valid', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ body: 'halo', mood: 'sedih' })).toEqual({
      body: 'halo',
      mood: 'sedih',
    });
  });

  it('reports field-level detail with a stable code', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ body: '', mood: 'marah' });
      expect.unreachable('expected validation to fail');
    } catch (error) {
      const api = error as ApiException;
      expect(api.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(api.details ?? {}).sort()).toEqual(['body', 'mood']);
    }
  });
});
