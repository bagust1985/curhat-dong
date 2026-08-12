import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { CategoriesService } from '../posts/categories.service.js';
import { AuditService } from './audit.service.js';

export interface CategoryAdminView {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  displayOrder: number;
  isActive: boolean;
  /** Published posts using it — what makes archiving safe or not. */
  postCount: number;
}

/**
 * Category management — E14-T11. PRD §16, DESIGN-REF §3.7.
 *
 * Two rules, both about not breaking history:
 *
 * **Archive, never delete.** Every post carries a category id. Deleting a row
 * would either orphan those posts or cascade them away — so `isActive` goes
 * false, the category disappears from the picker and Explore, and the posts
 * that already used it keep rendering.
 *
 * **A slug is permanent once used.** Slugs appear in URLs and in the feed's
 * topic filter; changing one silently breaks every link anyone shared. The name
 * and icon are editable precisely so the slug does not have to be.
 */
@Injectable()
export class CategoryAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  /** Every category, active or not — the admin list shows both. */
  async list(): Promise<CategoryAdminView[]> {
    const rows = await this.prisma.postCategory.findMany({
      orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }],
      include: { _count: { select: { posts: { where: { status: 'published' } } } } },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      postCount: row._count.posts,
    }));
  }

  async create(input: {
    adminId: string;
    slug: string;
    name: string;
    icon?: string | undefined;
    displayOrder?: number | undefined;
  }): Promise<CategoryAdminView> {
    const slug = normaliseSlug(input.slug);

    const existing = await this.prisma.postCategory.findUnique({ where: { slug } });
    if (existing) {
      throw ApiException.conflict('CONFLICT', 'Slug itu sudah dipakai kategori lain.');
    }

    const created = await this.prisma.postCategory.create({
      data: {
        slug,
        name: input.name.trim(),
        ...(input.icon ? { icon: input.icon } : {}),
        displayOrder: input.displayOrder ?? (await this.nextDisplayOrder()),
      },
    });

    await this.categories.invalidateCache();

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.category.created',
      targetType: 'post_category',
      targetId: created.id,
      diff: { slug, name: created.name },
    });

    return { ...created, postCount: 0 };
  }

  /**
   * Edits the presentation, never the slug.
   *
   * `slug` is not a parameter here at all — there is no request shape that can
   * ask for it, which is a stronger guarantee than validating it away.
   */
  async update(input: {
    adminId: string;
    id: string;
    name?: string | undefined;
    icon?: string | null | undefined;
    displayOrder?: number | undefined;
  }): Promise<CategoryAdminView> {
    const before = await this.require(input.id);

    const after = await this.prisma.postCategory.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      },
      include: { _count: { select: { posts: { where: { status: 'published' } } } } },
    });

    await this.categories.invalidateCache();

    await this.audit.recordChange(
      {
        actorId: input.adminId,
        action: 'admin.category.updated',
        targetType: 'post_category',
        targetId: input.id,
      },
      { name: before.name, icon: before.icon, displayOrder: before.displayOrder },
      { name: after.name, icon: after.icon, displayOrder: after.displayOrder },
    );

    return {
      id: after.id,
      slug: after.slug,
      name: after.name,
      icon: after.icon,
      displayOrder: after.displayOrder,
      isActive: after.isActive,
      postCount: after._count.posts,
    };
  }

  /**
   * Reorders in one transaction.
   *
   * All or nothing: a half-applied drag leaves a list whose order nobody chose,
   * and the admin's next drag would start from that.
   */
  async reorder(input: {
    adminId: string;
    order: Array<{ id: string; displayOrder: number }>;
  }): Promise<CategoryAdminView[]> {
    await this.prisma.$transaction(
      input.order.map((entry) =>
        this.prisma.postCategory.update({
          where: { id: entry.id },
          data: { displayOrder: entry.displayOrder },
        }),
      ),
    );

    await this.categories.invalidateCache();

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.category.reordered',
      targetType: 'post_category',
      diff: { count: input.order.length },
    });

    return this.list();
  }

  /**
   * Archives or restores.
   *
   * Archiving a category with posts is allowed and is the normal case — the
   * posts stay readable, they simply stop being offered as a choice. The count
   * is recorded in the audit entry so the decision is reviewable later.
   */
  async setActive(input: {
    adminId: string;
    id: string;
    isActive: boolean;
  }): Promise<CategoryAdminView> {
    const before = await this.require(input.id);

    const after = await this.prisma.postCategory.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
      include: { _count: { select: { posts: { where: { status: 'published' } } } } },
    });

    await this.categories.invalidateCache();

    await this.audit.record({
      actorId: input.adminId,
      action: input.isActive ? 'admin.category.restored' : 'admin.category.archived',
      targetType: 'post_category',
      targetId: input.id,
      diff: { slug: after.slug, postCount: after._count.posts, was: before.isActive },
    });

    return {
      id: after.id,
      slug: after.slug,
      name: after.name,
      icon: after.icon,
      displayOrder: after.displayOrder,
      isActive: after.isActive,
      postCount: after._count.posts,
    };
  }

  private async require(id: string) {
    const category = await this.prisma.postCategory.findUnique({ where: { id } });
    if (!category) {
      throw ApiException.notFound('NOT_FOUND', 'Kategori itu tidak ditemukan.');
    }
    return category;
  }

  private async nextDisplayOrder(): Promise<number> {
    const last = await this.prisma.postCategory.findFirst({
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    return (last?.displayOrder ?? 0) + 1;
  }
}

/** Lowercase, hyphenated, no surprises in a URL. */
function normaliseSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
