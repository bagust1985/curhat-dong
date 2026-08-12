import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';

/**
 * JSON, spelled out.
 *
 * Prisma's Json input rejects `Record<string, unknown>` — `unknown` could be a
 * function or a Date, neither of which survives a round trip. Naming the shape
 * we actually store is both what the column holds and what the type checker
 * needs.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Config changes only. Never curhat, chat or AI content (PRD §25.6). */
  diff?: JsonObject | null;
  ipHash?: string | null;
  /** The open case that justified reading private content (E14-T04). */
  caseId?: string | null;
}

export interface AuditView {
  id: string;
  actorId: string | null;
  actorAlias: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  diff: JsonObject | null;
  caseId: string | null;
  createdAt: Date;
}

export interface AuditPage {
  items: AuditView[];
  nextCursor: string | null;
}

export interface AuditFilter {
  actorId?: string | undefined;
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/**
 * Keys whose values are redacted before a diff is stored.
 *
 * A config diff is genuinely useful — "who lowered the self-harm threshold, and
 * from what" is the question an incident review starts with. But a diff is also
 * the easiest place for content to arrive by accident, because it is a blob
 * someone assembles at the call site.
 */
const REDACTED_KEYS = [
  'body',
  'content',
  'message',
  'text',
  'excerpt',
  'preview',
  'email',
  'emailEncrypted',
  'pushToken',
  'pushTokenEncrypted',
  'mfaSecretEncrypted',
  'refreshToken',
  'accessToken',
  'secret',
  'password',
];

const REDACTED = '[redacted]';

/**
 * Audit log — E14-T03. PRD §25.6, TECH-SPEC §3.6.
 *
 * Append-only by construction: this service exposes `record`, `list` and
 * `exportCsv`, and no update or delete of any kind. There is no admin endpoint
 * that edits or removes an audit row, because the service that would have to
 * do it has no such method. An audit log an admin can edit is not evidence of
 * anything.
 *
 * `record` never throws. An audit failure must not roll back the action it
 * describes — a moderator's ban succeeding while the log write fails is bad,
 * but a ban failing because of a logging problem is worse, and it teaches
 * people to retry until something sticks. Failures are logged loudly instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          ipHash: entry.ipHash ?? null,
          caseId: entry.caseId ?? null,
          // Spread rather than a conditional value: `exactOptionalPropertyTypes`
          // distinguishes "absent" from "explicitly undefined", and Prisma's
          // Json input accepts the former only.
          ...(entry.diff ? { diff: redactDiff(entry.diff) as JsonObject } : {}),
        },
      });
    } catch (error) {
      // Loud, because a gap in the audit log is exactly what an investigation
      // would need and exactly what nobody notices at the time.
      this.logger.error(`failed to write audit entry ${entry.action}`, error);
    }
  }

  /**
   * Records a configuration change with its before/after.
   *
   * Only keys that actually changed are stored — a full snapshot makes every
   * diff look enormous and buries the one line that matters.
   */
  async recordChange(
    entry: Omit<AuditEntry, 'diff'>,
    before: JsonObject,
    after: JsonObject,
  ): Promise<void> {
    const changed: JsonObject = {};

    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changed[key] = { from: before[key] ?? null, to: after[key] ?? null };
      }
    }

    if (Object.keys(changed).length === 0) return;

    await this.record({ ...entry, diff: changed });
  }

  async list(filter: AuditFilter = {}): Promise<AuditPage> {
    const limit = filter.limit ?? 50;
    const cursor = decodeCursor(filter.cursor);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(filter.actorId ? { actorId: filter.actorId } : {}),
        ...(filter.action ? { action: { contains: filter.action } } : {}),
        ...(filter.targetType ? { targetType: filter.targetType } : {}),
        ...(filter.targetId ? { targetId: filter.targetId } : {}),
        ...(filter.from || filter.to
          ? {
              createdAt: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { actor: { select: { profile: { select: { alias: true } } } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorAlias: row.actor?.profile?.alias ?? null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        diff: (row.diff as JsonObject | null) ?? null,
        caseId: row.caseId,
        createdAt: row.createdAt,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * CSV export for an external review.
   *
   * The diff column is JSON-encoded rather than flattened: a compliance
   * reviewer needs the exact recorded value, not a prettier version of it.
   */
  async exportCsv(filter: AuditFilter = {}): Promise<string> {
    const { items } = await this.list({ ...filter, limit: 5_000 });

    const header = 'created_at,actor_id,actor_alias,action,target_type,target_id,case_id,diff';
    const rows = items.map((item) =>
      [
        item.createdAt.toISOString(),
        item.actorId ?? '',
        item.actorAlias ?? '',
        item.action,
        item.targetType,
        item.targetId ?? '',
        item.caseId ?? '',
        JSON.stringify(item.diff ?? {}),
      ]
        .map(csvCell)
        .join(','),
    );

    return [header, ...rows].join('\n');
  }
}

/**
 * Replaces the value of any key that could carry content.
 *
 * Recursive, because a diff is nested by construction (`{from, to}` pairs) and
 * a top-level-only sweep would miss `{body: {from: '…', to: '…'}}`.
 */
export function redactDiff(input: JsonValue, depth = 0): JsonValue {
  if (depth > 6 || input === null || typeof input !== 'object') return input;

  if (Array.isArray(input)) return input.map((item) => redactDiff(item, depth + 1));

  const output: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = REDACTED_KEYS.includes(key) ? REDACTED : redactDiff(value, depth + 1);
  }
  return output;
}

/**
 * Escapes a CSV cell.
 *
 * A moderator's reason is free text and will eventually contain a comma, a
 * quote or a newline. Without this the export silently shifts columns, which
 * is worse than failing.
 */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;

  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id || !UUID_PATTERN.test(id)) return null;

    const createdAt = new Date(iso);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
  } catch {
    return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
