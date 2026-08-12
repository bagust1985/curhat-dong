import type { AdminRole } from '@curhat/types';

/**
 * Admin RBAC — E14-T02. PRD §2, TECH-SPEC §3.6.
 *
 * Two rules shape this file.
 *
 * **Default deny.** The matrix is an allow-list keyed by role. A permission
 * that nobody has been granted is denied, and a role added later starts with
 * nothing until someone writes down what it may do. The alternative — deny-list
 * — fails in the direction where a new endpoint is reachable by everyone
 * because nobody remembered to exclude them.
 *
 * **Roles are not a hierarchy.** Super Admin is not "moderator plus extras";
 * Content Manager cannot moderate, and Finance cannot read a curhat at all.
 * Modelling this as ranked levels would mean the finance role inherits content
 * access on its way up the ladder, and nobody would notice until it mattered.
 * The one concession is that Super Admin is granted everything explicitly,
 * below — spelled out rather than implied.
 */

export const ADMIN_PERMISSIONS = [
  // Moderation
  'moderation.queue.read',
  'moderation.case.read',
  'moderation.action.apply',
  'moderation.action.bulk',
  'appeal.read',
  'appeal.decide',

  // Private content — always additionally gated by an open case (E14-T04)
  'content.private.read',

  // Users
  'user.read',
  'user.action.apply',
  'listener.read',
  'listener.suspend',

  // Content
  'content.read',
  'content.moderate',
  'category.manage',

  // Platform configuration
  'ai_config.read',
  'ai_config.write',
  'support_resources.manage',
  'notification.broadcast',

  // Observability
  'analytics.read',
  'audit.read',
  'admin.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * Actions that demand a fresh MFA challenge, not just a valid session
 * (E14-T01).
 *
 * The test is "would this be catastrophic performed by someone who walked up
 * to an unlocked laptop?" Banning a user, reading somebody's private messages,
 * and editing the safety thresholds all pass that test. Reading the moderation
 * queue does not.
 */
export const REAUTH_PERMISSIONS: readonly AdminPermission[] = [
  'content.private.read',
  'user.action.apply',
  'ai_config.write',
  'admin.manage',
  'notification.broadcast',
];

/**
 * The matrix. Every role's full set, written out.
 *
 * Deliberately verbose: a permission table is read far more often than it is
 * written, and the question it has to answer instantly is "what exactly can a
 * Customer Support account do?" — not "what does it inherit from where?"
 */
const MATRIX: Record<AdminRole, readonly AdminPermission[]> = {
  /** Everything, listed rather than implied. */
  super_admin: ADMIN_PERMISSIONS,

  moderator: [
    'moderation.queue.read',
    'moderation.case.read',
    'moderation.action.apply',
    'moderation.action.bulk',
    'appeal.read',
    'appeal.decide',
    'content.private.read',
    'user.read',
    'user.action.apply',
    'listener.read',
    'listener.suspend',
    'content.read',
    'content.moderate',
    'analytics.read',
  ],

  /**
   * Support answers questions about accounts. It can look, and it can read the
   * moderation history that explains why something happened to someone — but
   * it cannot act on an account, and it cannot open private content. A support
   * ticket is not a justification for reading somebody's room.
   */
  customer_support: ['user.read', 'listener.read', 'content.read', 'analytics.read'],

  /**
   * Categories and broadcasts. No moderation, no user actions, no private
   * content — this role edits the shelf, not what is on it.
   */
  content_manager: ['category.manage', 'notification.broadcast', 'content.read', 'analytics.read'],

  /** `[P2]` — billing does not exist yet, so this role can only read metrics. */
  finance: ['analytics.read'],
};

export function permissionsFor(role: AdminRole): readonly AdminPermission[] {
  return MATRIX[role] ?? [];
}

/**
 * The single authorisation question.
 *
 * `role` is deliberately typed as `AdminRole | null | undefined`: an ordinary
 * user has no admin role, and that must be answered "no" here rather than by
 * every caller remembering to check first.
 */
export function can(role: AdminRole | null | undefined, permission: AdminPermission): boolean {
  if (!role) return false;
  return permissionsFor(role).includes(permission);
}

export function requiresReauth(permission: AdminPermission): boolean {
  return REAUTH_PERMISSIONS.includes(permission);
}

/** True when the role may reach the admin panel at all. */
export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role !== null && role !== undefined && role in MATRIX;
}
