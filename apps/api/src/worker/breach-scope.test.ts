import { describe, expect, it } from 'vitest';

import {
  DATA_CATEGORIES,
  NOTIFICATION_DEADLINE_HOURS,
  auditWindow,
  hoursRemaining,
  notificationDeadline,
  scopeFromAudit,
  type AuditRow,
} from './breach-scope';

/**
 * Breach scoping — E17-T09. UU PDP, PRD §25.6.
 *
 * The acceptance criterion is a capability that has to exist *before* an
 * incident, because it cannot be built inside 72 hours while also containing
 * one. These tests are what make "we can determine who was affected" a fact
 * rather than an intention.
 */

const row = (overrides: Partial<AuditRow>): AuditRow => ({
  actorId: 'admin-1',
  action: 'private_content.open',
  targetType: 'post',
  targetId: 'post-1',
  caseId: 'case-1',
  createdAt: new Date('2026-08-13T02:00:00Z'),
  ...overrides,
});

describe('turning an audit trail into a scope', () => {
  it('lists the users a compromised admin session reached', () => {
    const scope = scopeFromAudit([
      row({ action: 'user.detail', targetType: 'user', targetId: 'user-1' }),
      row({ action: 'user.detail', targetType: 'user', targetId: 'user-2' }),
      row({ action: 'private_content.open', targetType: 'post', targetId: 'post-9' }),
    ]);

    expect(scope.affectedUserIds.sort()).toEqual(['post-9', 'user-1', 'user-2']);
  });

  it('names the categories of data, not the data', () => {
    const scope = scopeFromAudit([row({ action: 'private_content.open' })]);

    expect(scope.categories).toContain('content');
    expect(scope.categories).toContain('sensitive');
    // A breach response that dumps the affected curhat into a working file has
    // widened the breach while measuring it.
    expect(JSON.stringify(scope)).not.toMatch(/body|excerpt|isi/i);
  });

  it('counts a failed access attempt without counting it as exposure', () => {
    // E14-T04 logs refused attempts too. They matter for the post-mortem and
    // must not inflate the notification.
    const scope = scopeFromAudit([
      row({ action: 'private_content.attempt', targetType: 'post', targetId: 'post-3' }),
    ]);

    expect(scope.affectedUserIds).toEqual([]);
    expect(scope.categories).toEqual([]);
    expect(scope.actionCounts[0]).toEqual({ action: 'private_content.attempt', count: 1 });
  });

  it('reports an action it does not recognise instead of assuming it was harmless', () => {
    // An action added later and never mapped would otherwise be counted as
    // touching nothing, and the notification would understate the breach.
    const scope = scopeFromAudit([
      row({ action: 'admin.new_thing_from_2027', targetType: 'user', targetId: 'user-7' }),
    ]);

    expect(scope.hasUnclassifiedActions).toBe(true);
    expect(scope.unclassifiedActions).toEqual(['admin.new_thing_from_2027']);
    // And the user is still counted as affected.
    expect(scope.affectedUserIds).toEqual(['user-7']);
  });

  it('ranks actions so the post-mortem starts with what happened most', () => {
    const scope = scopeFromAudit([
      row({ action: 'user.detail', targetType: 'user', targetId: 'a' }),
      row({ action: 'user.detail', targetType: 'user', targetId: 'b' }),
      row({ action: 'private_content.open' }),
    ]);

    expect(scope.actionCounts[0]?.action).toBe('user.detail');
    expect(scope.actionCounts[0]?.count).toBe(2);
  });

  it('names every category in words a notification can use', () => {
    for (const value of Object.values(DATA_CATEGORIES)) {
      expect(value.length).toBeGreaterThan(10);
      // Indonesian, readable by the person receiving the letter.
      expect(value).not.toMatch(/[a-z]_[a-z]/);
    }
  });
});

describe('the window to pull', () => {
  it('starts from the suspected compromise, not from when it was noticed', () => {
    // The gap between those two is usually where the damage is; scoping to
    // "since we found out" understates the breach.
    const window = auditWindow(
      new Date('2026-08-10T00:00:00Z'),
      new Date('2026-08-13T00:00:00Z'),
    );

    expect(window.hours).toBe(72);
    expect(window.from.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('the UU PDP clock', () => {
  it('is 3x24 hours from becoming aware', () => {
    expect(NOTIFICATION_DEADLINE_HOURS).toBe(72);
    expect(notificationDeadline(new Date('2026-08-13T00:00:00Z')).toISOString()).toBe(
      '2026-08-16T00:00:00.000Z',
    );
  });

  it('counts down, and goes negative rather than clamping', () => {
    const aware = new Date('2026-08-13T00:00:00Z');
    expect(hoursRemaining(aware, new Date('2026-08-14T00:00:00Z'))).toBe(48);
    // A missed deadline must read as missed, not as zero.
    expect(hoursRemaining(aware, new Date('2026-08-17T00:00:00Z'))).toBe(-24);
  });
});
