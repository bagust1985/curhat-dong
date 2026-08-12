import { ADMIN_ROLES } from '@curhat/types';
import { describe, expect, it } from 'vitest';

import { ADMIN_NAV } from './navigation.js';

describe('admin navigation (DESIGN-REF §3)', () => {
  it('covers every admin page in the design reference', () => {
    const hrefs = ADMIN_NAV.map((item) => item.href);

    // Including the two pages added in v1.1 — without these, a moderated user
    // has no way to appeal (PRD §15.4) and the crisis screen has no content
    // to show (PRD §15.2).
    expect(hrefs).toContain('/appeals');
    expect(hrefs).toContain('/support-resources');

    expect(hrefs).toEqual([...new Set(hrefs)]);
  });

  it('only references roles that exist', () => {
    for (const item of ADMIN_NAV) {
      expect(ADMIN_ROLES).toContain(item.minRole);
    }
  });

  it('keeps the most sensitive pages behind super_admin', () => {
    const bySensitivity = ['/ai-config', '/audit', '/settings', '/support-resources'];
    for (const href of bySensitivity) {
      const item = ADMIN_NAV.find((nav) => nav.href === href);
      expect(item, `${href} missing from nav`).toBeDefined();
      expect(item?.minRole).toBe('super_admin');
    }
  });

  it('surfaces a badge on the queues that carry an SLA', () => {
    // Critical moderation (15 min) and appeals (7 days) are the two queues
    // where nobody noticing is itself the failure — PRD §15.3, §15.4.
    const badged = ADMIN_NAV.filter((item) => item.badge).map((item) => item.href);
    expect(badged.sort()).toEqual(['/appeals', '/moderation']);
  });
});
