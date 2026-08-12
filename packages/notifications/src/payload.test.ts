import { describe, expect, it } from 'vitest';

import {
  buildNotificationPayload,
  containsFreeText,
  rebuildNotificationPayload,
  UnknownNotificationTemplateError,
  type NotificationRequest,
} from './payload.js';
import {
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_KEYS,
  deepLinkFor,
  isNotificationTemplateKey,
  type NotificationTemplateKey,
} from './templates.js';

/**
 * E12-T04 — CLAUDE.md non-negotiable #3.
 *
 * These tests exist to fail loudly the day someone adds a `body` parameter
 * "just for this one notification". The compile-time half of the guarantee is
 * asserted with @ts-expect-error: those lines are checked by `pnpm typecheck`,
 * and if the escape hatch ever became legal the directive itself would error.
 */

const POST_BODY =
  'Aku capek banget hari ini, rasanya nggak ada yang ngerti apa yang aku rasain.';

describe('notification payload privacy (E12-T04)', () => {
  it('builds copy from the catalogue, never from the caller', () => {
    const payload = buildNotificationPayload({
      template: 'response.comment',
      targetId: '11111111-1111-4111-8111-111111111111',
    });

    expect(payload.body).toBe('Ada seseorang yang membalas curhatmu.');
    expect(payload.title).toBe('Curhat Dong');
    expect(payload.deepLink).toBe('/post/11111111-1111-4111-8111-111111111111');
  });

  it('has no parameter that accepts curhat content', () => {
    // @ts-expect-error — `body` is not part of NotificationRequest. This is the
    // whole point of the type: the mistake does not compile.
    const attempt = () => buildNotificationPayload({ template: 'response.comment', body: POST_BODY });

    // Even if the type check were bypassed at runtime, nothing is copied over.
    const payload = attempt();
    expect(JSON.stringify(payload)).not.toContain('capek');
    expect(payload.body).toBe('Ada seseorang yang membalas curhatmu.');
  });

  it('rejects a widened object carrying text, not just an inline literal', () => {
    const smuggled = {
      template: 'response.comment' as const,
      targetId: 'abc',
      preview: POST_BODY,
    };

    // @ts-expect-error — excess-property checking would miss this; NoFreeText
    // does not, which is the case that actually happens in real code.
    const payload = buildNotificationPayload(smuggled);

    expect(JSON.stringify(payload)).not.toContain('capek');
  });

  it('rebuilds from stored JSON instead of trusting it', () => {
    // A row written by a looser version of this code, or tampered with.
    const stored = {
      template: 'response.comment',
      targetId: 'post-1',
      title: 'Rina membalas',
      body: POST_BODY,
    };

    const payload = rebuildNotificationPayload(stored);

    expect(payload.body).toBe('Ada seseorang yang membalas curhatmu.');
    expect(payload.title).toBe('Curhat Dong');
    expect(JSON.stringify(payload)).not.toContain('capek');
  });

  it('refuses an unknown template rather than inventing copy for it', () => {
    expect(() => rebuildNotificationPayload({ template: 'response.with_excerpt' })).toThrow(
      UnknownNotificationTemplateError,
    );
    expect(() => rebuildNotificationPayload({})).toThrow(UnknownNotificationTemplateError);
  });

  it('flags objects carrying free-text keys', () => {
    expect(containsFreeText({ template: 'response.comment', targetId: 'x' })).toBe(false);
    expect(containsFreeText({ template: 'response.comment', body: POST_BODY })).toBe(true);
    expect(containsFreeText({ alias: 'PurnamaSunyi' })).toBe(true);
    expect(containsFreeText(null)).toBe(false);
  });
});

describe('template catalogue (TECH-SPEC §6.2)', () => {
  it('carries the three strings the spec lists as allowed', () => {
    const bodies = NOTIFICATION_TEMPLATE_KEYS.map((key) => NOTIFICATION_TEMPLATES[key].body);

    expect(bodies).toContain('Ada seseorang yang membalas curhatmu.');
    expect(bodies).toContain('Ada seseorang yang sedang butuh didengar.');
    expect(bodies).toContain('Listener tersedia untukmu.');
  });

  it('has no template whose copy contains a placeholder', () => {
    // A placeholder is how content gets in: `{body}` needs a value, and the
    // only value anyone would reach for is the curhat itself.
    for (const key of NOTIFICATION_TEMPLATE_KEYS) {
      const { title, body } = NOTIFICATION_TEMPLATES[key];
      expect(title, key).not.toMatch(/[{}$%]|\$\{|:[a-z]/i);
      expect(body, key).not.toMatch(/[{}$%]|\$\{/);
    }
  });

  it('never names a person', () => {
    // "Rina membalas curhatmu" identifies who read it. Anonymity is the
    // product (PRD §5), so notifications stay in the third person.
    for (const key of NOTIFICATION_TEMPLATE_KEYS) {
      expect(NOTIFICATION_TEMPLATES[key].body, key).toMatch(/^[^@]*$/);
    }
  });

  it('marks the offers that expire as perishable', () => {
    // Held past quiet hours these point at nothing (E12-T05).
    expect(NOTIFICATION_TEMPLATES['listener.match_offer'].perishable).toBe(true);
    expect(NOTIFICATION_TEMPLATES['listener.nudge'].perishable).toBe(true);
    expect(NOTIFICATION_TEMPLATES['response.comment'].perishable).toBe(false);
  });

  it('routes every template to a real path', () => {
    for (const key of NOTIFICATION_TEMPLATE_KEYS) {
      expect(deepLinkFor(key, 'target-id'), key).toMatch(/^\//);
      expect(deepLinkFor(key, null), key).toMatch(/^\//);
    }
  });

  it('recognises only catalogued keys', () => {
    expect(isNotificationTemplateKey('response.comment')).toBe(true);
    expect(isNotificationTemplateKey('response.made_up')).toBe(false);
    expect(isNotificationTemplateKey(42)).toBe(false);
  });

  it('keeps safety and account templates in their exempt categories', () => {
    // E12-T05 exempts these from quiet hours by category, so a miscategorised
    // template would silently make a nudge wake someone at 2am.
    expect(NOTIFICATION_TEMPLATES['safety.support_available'].category).toBe('safety');
    expect(NOTIFICATION_TEMPLATES['account.appeal_result'].category).toBe('account');
    expect(NOTIFICATION_TEMPLATES['listener.nudge'].category).toBe('listener');
  });
});

describe('request shape', () => {
  it('accepts only ids alongside the template', () => {
    const request: NotificationRequest = {
      template: 'listener.matched' satisfies NotificationTemplateKey,
      targetId: 'room-1',
      dedupeKey: 'match:1',
    };

    expect(buildNotificationPayload(request).deepLink).toBe('/room/room-1');
  });
});
