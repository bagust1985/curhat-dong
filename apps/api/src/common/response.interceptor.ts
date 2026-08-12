import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { ApiMeta, ApiResponse } from '@curhat/types';
import { map, type Observable } from 'rxjs';

/** Marker so a handler can return data plus pagination meta. */
export interface WithMeta<T> {
  __meta: ApiMeta;
  data: T;
}

export function withMeta<T>(data: T, meta: ApiMeta): WithMeta<T> {
  return { __meta: meta, data };
}

function hasMeta<T>(value: unknown): value is WithMeta<T> {
  return typeof value === 'object' && value !== null && '__meta' in value;
}

/**
 * Wraps every successful response in the `{ data, meta, error }` envelope
 * (TECH-SPEC §3). Handlers return plain values; the shape is applied here so
 * it cannot be forgotten in one controller and present in another.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((payload): ApiResponse<T> => {
        if (hasMeta<T>(payload)) {
          return { data: payload.data, meta: payload.__meta, error: null };
        }
        return { data: payload, meta: {}, error: null };
      }),
    );
  }
}
