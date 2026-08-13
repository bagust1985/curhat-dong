/**
 * Breach scope — E17-T09. UU PDP, PRD §25.6.
 *
 * ## Why this is code and not a paragraph in a runbook
 *
 * UU PDP gives 3×24 hours to notify in writing. Inside that window nobody is
 * going to write a query against a schema they are seeing for the first time,
 * at 2am, while also containing the incident. The question "whose data was in
 * this?" has to be answerable **before** it is asked.
 *
 * So the mapping from an incident to a set of affected users lives here, is
 * tested, and takes a shape the SOP can just run.
 *
 * ## What it deliberately does not do
 *
 * It returns **user ids and categories of data**, never the data itself. A
 * breach response that starts by dumping the affected curhat into a working
 * file has widened the breach in the course of measuring it.
 */

/** The kinds of incident this can scope. Anything else is `unknown`. */
export type IncidentKind =
  | 'admin_account_compromise'
  | 'database_exposure'
  | 'token_leak'
  | 'third_party_processor'
  | 'unknown';

export interface AuditRow {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  caseId: string | null;
  createdAt: Date;
}

/**
 * The data categories a notification has to name.
 *
 * UU PDP notification asks what kind of personal data was involved, not how
 * many rows. These are the answers this product can truthfully give.
 */
export const DATA_CATEGORIES = {
  identity: 'Alamat email (dalam bentuk hash) dan nama samaran',
  content: 'Isi curhat, komentar, atau percakapan pribadi',
  sensitive: 'Data yang bisa menunjukkan kondisi emosional atau kesehatan mental',
  technical: 'Token sesi, identitas perangkat',
} as const;

export type DataCategory = keyof typeof DATA_CATEGORIES;

/**
 * Which actions in the audit log touched whose data.
 *
 * `targetType` is what makes this possible: every audited action records what
 * kind of thing it reached, so a compromised admin session can be turned into a
 * list of affected users by reading its own trail (E14-T03).
 */
const ACTION_CATEGORIES: Record<string, DataCategory[]> = {
  'private_content.open': ['content', 'sensitive'],
  'private_content.attempt': [],
  'user.search': ['identity'],
  'user.detail': ['identity'],
  'listener.detail': ['identity'],
  'moderation.case.open': ['content', 'sensitive'],
  'moderation.action': ['content'],
  'appeal.decide': ['content'],
  'export.request': ['identity', 'content', 'sensitive'],
};

export interface BreachScope {
  /** Distinct users whose data was reachable in the window. */
  affectedUserIds: string[];
  categories: DataCategory[];
  /** Actions that touched data, most frequent first — for the post-mortem. */
  actionCounts: Array<{ action: string; count: number }>;
  /** True when the trail contains an action this map does not know. */
  hasUnclassifiedActions: boolean;
  unclassifiedActions: string[];
}

/**
 * Turns an audit trail into a scope.
 *
 * `hasUnclassifiedActions` matters more than it looks: an action added later
 * and never mapped here would otherwise be silently counted as touching
 * nothing, and the notification would understate the breach. Unknown is
 * reported, not assumed harmless.
 */
export function scopeFromAudit(rows: readonly AuditRow[]): BreachScope {
  const users = new Set<string>();
  const categories = new Set<DataCategory>();
  const counts = new Map<string, number>();
  const unclassified = new Set<string>();

  for (const row of rows) {
    counts.set(row.action, (counts.get(row.action) ?? 0) + 1);

    const mapped = ACTION_CATEGORIES[row.action];
    if (mapped === undefined) {
      unclassified.add(row.action);
      // Counted as affected: an unknown action that named a user is assumed to
      // have reached them until somebody says otherwise.
      if (row.targetType === 'user' && row.targetId) users.add(row.targetId);
      continue;
    }

    if (mapped.length === 0) continue;

    for (const category of mapped) categories.add(category);
    if (row.targetId && (row.targetType === 'user' || row.targetType === 'post')) {
      users.add(row.targetId);
    }
  }

  return {
    affectedUserIds: [...users],
    categories: [...categories],
    actionCounts: [...counts.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
    hasUnclassifiedActions: unclassified.size > 0,
    unclassifiedActions: [...unclassified],
  };
}

/**
 * The window to pull from the audit log.
 *
 * Starts from the earliest plausible compromise, not from when it was noticed.
 * The gap between those two is usually where the actual damage is, and a
 * notification scoped to "since we found out" is a notification that
 * understates itself.
 */
export function auditWindow(
  suspectedStart: Date,
  containedAt: Date,
): { from: Date; to: Date; hours: number } {
  const from = suspectedStart;
  const to = containedAt;
  return {
    from,
    to,
    hours: Math.max(0, Math.round((to.getTime() - from.getTime()) / 3_600_000)),
  };
}

/** UU PDP: written notification within 3×24 hours of becoming aware. */
export const NOTIFICATION_DEADLINE_HOURS = 72;

export function notificationDeadline(awareAt: Date): Date {
  return new Date(awareAt.getTime() + NOTIFICATION_DEADLINE_HOURS * 3_600_000);
}

export function hoursRemaining(awareAt: Date, now: Date): number {
  return Math.round((notificationDeadline(awareAt).getTime() - now.getTime()) / 3_600_000);
}
