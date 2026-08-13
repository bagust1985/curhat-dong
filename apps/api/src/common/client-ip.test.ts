import { describe, expect, it } from 'vitest';

import { clientIpOf } from './client-ip';

const request = (headers: Record<string, string>, ip = '127.0.0.1') =>
  ({ header: (name: string) => headers[name.toLowerCase()], ip }) as never;

/**
 * Real client IP — E17. Behind Cloudflare + nginx on a shared VPS.
 */
describe('clientIpOf', () => {
  it('prefers the header Cloudflare sets and a client cannot forge', () => {
    expect(
      clientIpOf(request({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4' })),
    ).toBe('203.0.113.9');
  });

  it('takes the last hop of X-Forwarded-For, not the first', () => {
    // The left-most entry is whatever the client prepended; trusting it lets
    // anybody spoof their way out of a rate limit.
    expect(clientIpOf(request({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('falls back to the socket address when there is no proxy', () => {
    expect(clientIpOf(request({}, '198.51.100.4'))).toBe('198.51.100.4');
  });

  it('never returns the proxy address when a real one is available', () => {
    // 127.0.0.1 for everybody means one rate-limit bucket for the internet.
    expect(clientIpOf(request({ 'cf-connecting-ip': '203.0.113.9' }, '127.0.0.1'))).not.toBe(
      '127.0.0.1',
    );
  });
});
