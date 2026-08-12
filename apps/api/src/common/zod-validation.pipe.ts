import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { ApiException } from './api-error.js';

/**
 * Zod validation at the API boundary (CLAUDE.md konvensi).
 *
 * Field errors are returned as `details` so the UI can highlight the offending
 * input, while the top-level message stays generic Indonesian copy.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (result.success) return result.data;

    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }

    throw ApiException.badRequest(
      'VALIDATION_ERROR',
      'Ada isian yang belum benar. Coba cek lagi ya.',
      details,
    );
  }
}
