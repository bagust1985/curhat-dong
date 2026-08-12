import { Inject, Injectable } from '@nestjs/common';
import type {
  CaseSource,
  CaseStatus,
  ModerationQueue,
  PrismaClient,
  SafetyTarget,
} from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';

/**
 * How the SLA timer renders (DESIGN-REF §3.3).
 *
 * `due_soon` exists so the panel can warn before the deadline rather than
 * only mark the failure afterwards — a red badge on an already-breached case
 * tells a moderator something they can no longer act on.
 */
export type SlaState = 'ok' | 'due_soon' | 'breached';

export interface QueueItem {
  caseId: string;
  queue: ModerationQueue;
  status: CaseStatus;
  source: CaseSource;
  targetType: SafetyTarget;
  targetId: string;
  reportCount: number;
  assignedTo: string | null;
  createdAt: Date;
  slaDueAt: Date;
  slaState: SlaState;
  /** Negative once the deadline has passed. */
  minutesToSla: number;
  /** Age in minutes — what a moderator triages by when SLAs tie. */
  ageMinutes: number;
  /**
   * A short excerpt, for public content only.
   *
   * Null for anything private. Opening a private conversation is a separate,
   * deliberate act that needs the case gate and produces an audit entry
   * (E14-T04) — putting a preview in a list would make that gate decorative.
   */
  preview: string | null;
  /** True when reading the target at all requires the private-content flow. */
  requiresPrivateAccess: boolean;
}

export interface QueueCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** Open cases already past their deadline, across every queue. */
  breached: number;
}

export interface QueuePage {
  items: QueueItem[];
  nextCursor: string | null;
  counts: QueueCounts;
}

/** Preview length, matching the feed card (E05). */
const PREVIEW_LENGTH = 160;

/** Inside this many minutes of the deadline, the timer starts warning. */
const DUE_SOON_MINUTES = 15;

/**
 * Ordering weight. Critical is always on top (PRD §15.3) regardless of age —
 * a two-day-old spam report must never outrank a crisis that arrived a minute
 * ago.
 */
const QUEUE_RANK: Record<ModerationQueue, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * The moderation queue — E14-T05. PRD §15.3, TECH-SPEC §18.7, DESIGN-REF §3.3.
 *
 * A list, not a reading surface. It carries what a moderator triages by —
 * severity, age, deadline, how many people reported it — and for private
 * targets it carries no content at all.
 */
@Injectable()
export class ModerationQueueService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(
    filter: {
      queue?: ModerationQueue | undefined;
      status?: CaseStatus | undefined;
      breachedOnly?: boolean | undefined;
      assignedTo?: string | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    } = {},
    now: Date = new Date(),
  ): Promise<QueuePage> {
    const limit = filter.limit ?? 25;
    const cursor = decodeCursor(filter.cursor);

    const rows = await this.prisma.moderationCase.findMany({
      where: {
        ...(filter.queue ? { queue: filter.queue } : {}),
        // Default to what still needs doing. A resolved case is history, and
        // history belongs in the audit log, not the work queue.
        status: filter.status ? filter.status : { in: ['open', 'in_review', 'escalated'] },
        ...(filter.breachedOnly ? { slaDueAt: { lt: now } } : {}),
        ...(filter.assignedTo ? { assignedTo: filter.assignedTo } : {}),
        ...(cursor
          ? {
              // Keyset over the same composite the ordering uses. Ordering by
              // an enum directly would sort by its declaration order, which is
              // not the severity order, so the rank is compared explicitly.
              OR: [
                { queue: { in: queuesRankedAfter(cursor.queue) } },
                {
                  queue: cursor.queue,
                  OR: [
                    { slaDueAt: { gt: cursor.slaDueAt } },
                    { slaDueAt: cursor.slaDueAt, id: { gt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ queue: 'asc' }, { slaDueAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    // Prisma orders the enum by its schema declaration
    // (critical, high, medium, low), which happens to match severity — but
    // relying on that silently would break the day somebody reorders the enum.
    const sorted = [...rows].sort(
      (a, b) =>
        QUEUE_RANK[a.queue] - QUEUE_RANK[b.queue] ||
        a.slaDueAt.getTime() - b.slaDueAt.getTime() ||
        a.id.localeCompare(b.id),
    );

    const hasMore = sorted.length > limit;
    const page = hasMore ? sorted.slice(0, limit) : sorted;
    const last = page.at(-1);

    const items = await Promise.all(page.map((row) => this.toItem(row, now)));

    return {
      items,
      nextCursor:
        hasMore && last ? encodeCursor(last.queue, last.slaDueAt, last.id) : null,
      counts: await this.counts(now),
    };
  }

  /**
   * Badge counts per queue, plus how many are already late.
   *
   * A `groupBy` rather than four counts: the sidebar asks for all of them at
   * once on every page load.
   */
  async counts(now: Date = new Date()): Promise<QueueCounts> {
    const openStatuses: CaseStatus[] = ['open', 'in_review', 'escalated'];

    const [grouped, breached] = await Promise.all([
      this.prisma.moderationCase.groupBy({
        by: ['queue'],
        where: { status: { in: openStatuses } },
        _count: { _all: true },
      }),
      this.prisma.moderationCase.count({
        where: { status: { in: openStatuses }, slaDueAt: { lt: now } },
      }),
    ]);

    const counts: QueueCounts = { critical: 0, high: 0, medium: 0, low: 0, breached };
    for (const row of grouped) counts[row.queue] = row._count._all;

    return counts;
  }

  private async toItem(
    row: {
      id: string;
      queue: ModerationQueue;
      status: CaseStatus;
      source: CaseSource;
      targetType: SafetyTarget;
      targetId: string;
      reportCount: number;
      assignedTo: string | null;
      createdAt: Date;
      slaDueAt: Date;
    },
    now: Date,
  ): Promise<QueueItem> {
    const minutesToSla = Math.round((row.slaDueAt.getTime() - now.getTime()) / 60_000);

    return {
      caseId: row.id,
      queue: row.queue,
      status: row.status,
      source: row.source,
      targetType: row.targetType,
      targetId: row.targetId,
      reportCount: row.reportCount,
      assignedTo: row.assignedTo,
      createdAt: row.createdAt,
      slaDueAt: row.slaDueAt,
      slaState: minutesToSla < 0 ? 'breached' : minutesToSla <= DUE_SOON_MINUTES ? 'due_soon' : 'ok',
      minutesToSla,
      ageMinutes: Math.round((now.getTime() - row.createdAt.getTime()) / 60_000),
      preview: await this.preview(row.targetType, row.targetId),
      requiresPrivateAccess: row.targetType === 'message',
    };
  }

  /**
   * An excerpt for public content, nothing for private.
   *
   * The distinction is the whole point: a curhat is already visible to anyone
   * with the app, so a moderator reading a card is not an intrusion. A room
   * message is not, and it stays behind the case gate.
   */
  private async preview(targetType: SafetyTarget, targetId: string): Promise<string | null> {
    if (targetType === 'post') {
      const post = await this.prisma.curhatPost.findUnique({
        where: { id: targetId },
        select: { title: true, body: true },
      });
      if (!post) return null;
      return truncate(post.title ? `${post.title} — ${post.body}` : post.body);
    }

    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: targetId },
        select: { body: true },
      });
      return comment ? truncate(comment.body) : null;
    }

    // `message` and `user` deliberately have no preview.
    return null;
  }

  /** Claims a case, so two moderators do not work the same one. */
  async assign(caseId: string, moderatorId: string): Promise<{ assignedTo: string }> {
    await this.prisma.moderationCase.update({
      where: { id: caseId },
      data: { assignedTo: moderatorId, status: 'in_review' },
    });

    return { assignedTo: moderatorId };
  }
}

function truncate(text: string): string {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text;
}

/** Queues strictly less severe than `queue` — the next page's candidates. */
function queuesRankedAfter(queue: ModerationQueue): ModerationQueue[] {
  return (Object.keys(QUEUE_RANK) as ModerationQueue[]).filter(
    (candidate) => QUEUE_RANK[candidate] > QUEUE_RANK[queue],
  );
}

function encodeCursor(queue: ModerationQueue, slaDueAt: Date, id: string): string {
  return Buffer.from(`${queue}|${slaDueAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(
  cursor?: string,
): { queue: ModerationQueue; slaDueAt: Date; id: string } | null {
  if (!cursor) return null;

  try {
    const [queue, iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!queue || !iso || !id) return null;
    if (!(queue in QUEUE_RANK)) return null;
    if (!UUID_PATTERN.test(id)) return null;

    const slaDueAt = new Date(iso);
    return Number.isNaN(slaDueAt.getTime())
      ? null
      : { queue: queue as ModerationQueue, slaDueAt, id };
  } catch {
    return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
