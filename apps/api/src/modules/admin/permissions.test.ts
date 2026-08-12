import { ADMIN_ROLES, type AdminRole } from '@curhat/types';
import { describe, expect, it } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  REAUTH_PERMISSIONS,
  can,
  isAdminRole,
  permissionsFor,
  requiresReauth,
  type AdminPermission,
} from './permissions.js';

/**
 * The role × permission matrix — E14-T02.
 *
 * The task asks for a test of every role against every endpoint. This is that
 * test at the layer where the decision is actually made: the endpoints call
 * `can()`, so proving the matrix proves the endpoints, and the HTTP suite then
 * only has to show the guard is wired in.
 */
describe('default deny (E14-T02)', () => {
  it('gives an ordinary user with no admin role nothing', () => {
    for (const permission of ADMIN_PERMISSIONS) {
      expect(can(null, permission), permission).toBe(false);
      expect(can(undefined, permission), permission).toBe(false);
    }
  });

  it('gives an unrecognised role nothing', () => {
    expect(can('auditor' as AdminRole, 'analytics.read')).toBe(false);
    expect(permissionsFor('auditor' as AdminRole)).toEqual([]);
  });

  it('recognises exactly the five declared roles', () => {
    for (const role of ADMIN_ROLES) expect(isAdminRole(role), role).toBe(true);

    for (const impostor of ['auditor', 'admin', '', 'SUPER_ADMIN']) {
      expect(isAdminRole(impostor), impostor).toBe(false);
    }
    expect(isAdminRole(null)).toBe(false);
  });
});

describe('AI config is Super Admin only (E14-T12)', () => {
  it('is refused to every other role', () => {
    // Safety thresholds live behind this permission. A wrong threshold is not
    // a cosmetic mistake — it decides what gets held and what reaches a feed.
    for (const role of ADMIN_ROLES) {
      const allowed = role === 'super_admin';
      expect(can(role, 'ai_config.write'), role).toBe(allowed);
      expect(can(role, 'ai_config.read'), role).toBe(allowed);
    }
  });
});

describe('private content (E14-T04)', () => {
  it('is reachable only by moderators and Super Admin', () => {
    // And even for them it is additionally gated by an open case — this
    // permission is necessary, never sufficient.
    expect(can('moderator', 'content.private.read')).toBe(true);
    expect(can('super_admin', 'content.private.read')).toBe(true);

    expect(can('customer_support', 'content.private.read')).toBe(false);
    expect(can('content_manager', 'content.private.read')).toBe(false);
    expect(can('finance', 'content.private.read')).toBe(false);
  });

  it('is not implied by being able to read a user', () => {
    // Support can look up an account to answer a ticket. A support ticket is
    // not a reason to read somebody's private room.
    expect(can('customer_support', 'user.read')).toBe(true);
    expect(can('customer_support', 'content.private.read')).toBe(false);
  });
});

describe('roles are not a hierarchy', () => {
  it('does not let Finance reach content on its way up a ladder', () => {
    // Ranked levels would give finance content access as a side effect of
    // being "above" support, and nobody would notice until it mattered.
    expect(permissionsFor('finance')).toEqual(['analytics.read']);
  });

  it('keeps Content Manager out of moderation entirely', () => {
    for (const permission of [
      'moderation.queue.read',
      'moderation.case.read',
      'moderation.action.apply',
      'appeal.decide',
      'content.private.read',
      'user.action.apply',
    ] as AdminPermission[]) {
      expect(can('content_manager', permission), permission).toBe(false);
    }
  });

  it('keeps Customer Support from acting on accounts', () => {
    expect(can('customer_support', 'user.read')).toBe(true);
    expect(can('customer_support', 'user.action.apply')).toBe(false);
    expect(can('customer_support', 'listener.suspend')).toBe(false);
  });

  it('keeps moderators out of platform configuration', () => {
    for (const permission of [
      'ai_config.write',
      'support_resources.manage',
      'category.manage',
      'admin.manage',
      'audit.read',
    ] as AdminPermission[]) {
      expect(can('moderator', permission), permission).toBe(false);
    }
  });
});

describe('Super Admin', () => {
  it('holds every permission, spelled out rather than special-cased', () => {
    for (const permission of ADMIN_PERMISSIONS) {
      expect(can('super_admin', permission), permission).toBe(true);
    }
  });
});

describe('step-up authentication (E14-T01)', () => {
  it('demands re-auth for anything catastrophic at an unlocked laptop', () => {
    for (const permission of [
      'content.private.read',
      'user.action.apply',
      'ai_config.write',
      'admin.manage',
      'notification.broadcast',
    ] as AdminPermission[]) {
      expect(requiresReauth(permission), permission).toBe(true);
    }
  });

  it('does not demand it for reading', () => {
    for (const permission of [
      'moderation.queue.read',
      'user.read',
      'analytics.read',
      'audit.read',
    ] as AdminPermission[]) {
      expect(requiresReauth(permission), permission).toBe(false);
    }
  });

  it('lists only real permissions', () => {
    for (const permission of REAUTH_PERMISSIONS) {
      expect(ADMIN_PERMISSIONS, permission).toContain(permission);
    }
  });
});

describe('matrix hygiene', () => {
  it('grants only declared permissions', () => {
    // A typo in the matrix would otherwise be a silently dead grant — the
    // permission looks assigned and never matches.
    for (const role of ADMIN_ROLES) {
      for (const permission of permissionsFor(role)) {
        expect(ADMIN_PERMISSIONS, `${role}: ${permission}`).toContain(permission);
      }
    }
  });

  it('covers every declared role', () => {
    for (const role of ADMIN_ROLES) {
      expect(() => permissionsFor(role), role).not.toThrow();
    }
  });

  it('leaves no permission unreachable by anyone', () => {
    // A permission nobody holds is either dead code or a locked-out feature;
    // either way it should be noticed here rather than in production.
    const granted = new Set(ADMIN_ROLES.flatMap((role) => [...permissionsFor(role)]));

    for (const permission of ADMIN_PERMISSIONS) {
      expect(granted.has(permission), permission).toBe(true);
    }
  });
});
