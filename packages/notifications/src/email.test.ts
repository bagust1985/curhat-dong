import { describe, expect, it } from 'vitest';

import { renderOtpEmail } from './email.js';
import { ConsoleEmailProvider, createEmailProvider } from './email-providers.js';

describe('OTP email copy', () => {
  const rendered = renderOtpEmail({
    to: 'halo@curhatdong.com',
    code: '482913',
    expiresInMinutes: 10,
  });

  it('carries the code and how long it lasts', () => {
    expect(rendered.text).toContain('482913');
    expect(rendered.html).toContain('482913');
    expect(rendered.text).toContain('10 menit');
  });

  it('says what to do if it was not requested', () => {
    // Someone receiving an unexpected code should know nothing has changed,
    // rather than worry that their account was taken.
    expect(rendered.text.toLowerCase()).toContain('bukan kamu');
  });

  it('reveals nothing about the account beyond the code', () => {
    // An inbox is not always private, and this product's users have particular
    // reason to care who else can read their mail. No alias, no activity, no
    // hint of what the account is for.
    const body = `${rendered.text} ${rendered.html} ${rendered.subject}`.toLowerCase();

    for (const leak of ['curhat kamu', 'listener', 'alias', 'postingan', 'pesan dari']) {
      expect(body).not.toContain(leak);
    }
  });

  it('is written in Indonesian with a warm, non-clinical tone', () => {
    expect(rendered.text).toContain('Halo');
    expect(rendered.subject).toContain('CURHAT DONG');
  });
});

describe('provider selection (TECH-SPEC §5.2)', () => {
  it('builds the console provider for local development', () => {
    const provider = createEmailProvider({
      provider: 'console',
      nodeEnv: 'development',
      from: 'halo@curhatdong.com',
    });
    expect(provider).toBeInstanceOf(ConsoleEmailProvider);
  });

  it('refuses to use the console provider in production', () => {
    // A provider that silently sends nothing in production means nobody can
    // log in and nothing looks broken.
    expect(
      () =>
        new ConsoleEmailProvider('production'),
    ).toThrow(/never run in production/);
  });

  it('refuses Resend without an API key rather than failing at send time', () => {
    expect(() =>
      createEmailProvider({
        provider: 'resend',
        nodeEnv: 'production',
        from: 'halo@curhatdong.com',
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('rejects an unknown provider name', () => {
    expect(() =>
      createEmailProvider({
        provider: 'merpati-pos',
        nodeEnv: 'development',
        from: 'halo@curhatdong.com',
      }),
    ).toThrow(/Unsupported EMAIL_PROVIDER/);
  });
});
