import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';

const CACHE_KEY = 'categories:active';
const CACHE_TTL_SECONDS = 300;

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  displayOrder: number;
}

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async listActive(): Promise<CategoryView[]> {
    const cached = await this.redis.get(CACHE_KEY).catch(() => null);
    if (cached) return JSON.parse(cached) as CategoryView[];

    const categories = await this.prisma.postCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, slug: true, name: true, icon: true, displayOrder: true },
    });

    await this.redis
      .set(CACHE_KEY, JSON.stringify(categories), 'EX', CACHE_TTL_SECONDS)
      .catch(() => undefined);

    return categories;
  }

  /**
   * Called whenever admin edits a category (E14-T11).
   *
   * Invalidated explicitly rather than waiting for the TTL: an admin who fixes
   * a typo should see it immediately, not five minutes later.
   */
  async invalidateCache(): Promise<void> {
    await this.redis.del(CACHE_KEY).catch(() => undefined);
  }

  async requireBySlug(slug: string): Promise<CategoryView> {
    const category = (await this.listActive()).find((entry) => entry.slug === slug);

    if (!category) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Kategori itu nggak ada.');
    }

    return category;
  }
}
