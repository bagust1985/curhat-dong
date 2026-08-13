import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgeBlocked, AgeGate, EmailStep, OtpStep } from './auth';
import {
  AUTH_ERROR_COPY,
  AUTH_ERROR_FALLBACK,
  ENUMERATION_TELLS,
  authErrorMessage,
} from '../lib/auth-copy';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { bodyOf, err, ok, requestsOf, stubFetch } from '../test/fetch-stub';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/**
 * Auth — E15-T06. DESIGN-REF §2.2, TECH-SPEC §3.1.
 */
describe('error copy (no account-existence oracle)', () => {
  it('gives wrong, expired and rate-limited their own message', () => {
    const wrong = authErrorMessage('AUTH_OTP_INVALID');
    const expired = authErrorMessage('AUTH_OTP_EXPIRED');
    const limited = authErrorMessage('RATE_LIMITED');
    const attempts = authErrorMessage('AUTH_OTP_TOO_MANY_ATTEMPTS');

    expect(new Set([wrong, expired, limited, attempts]).size).toBe(4);
    expect(wrong).toMatch(/nggak cocok/i);
    expect(expired).toMatch(/kedaluwarsa/i);
  });

  it('falls back to something vague for codes it does not know', () => {
    // Vague is the correct behaviour: an unrecognised failure has nothing
    // useful to tell the user, and guessing invents a claim.
    expect(authErrorMessage('INTERNAL_ERROR')).toBe(AUTH_ERROR_FALLBACK);
    expect(authErrorMessage(null)).toBe(AUTH_ERROR_FALLBACK);
  });

  it('never says whether the email has an account', () => {
    // The whole vocabulary, not one screen: an enumeration leak arrives as a
    // helpful-sounding sentence somebody added later.
    for (const message of [...Object.values(AUTH_ERROR_COPY), AUTH_ERROR_FALLBACK]) {
      for (const tell of ENUMERATION_TELLS) {
        expect(message, `${message} vs ${tell}`).not.toMatch(tell);
      }
    }
  });
});

describe('email step', () => {
  it('carries the reassurance copy and links it to the field', () => {
    render(<EmailStep onSubmit={() => {}} pending={false} error={null} />);

    const input = screen.getByLabelText('Email');
    const description = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe(
      'Email kamu nggak akan pernah ditampilkan ke siapa pun.',
    );
  });

  it('announces the error through a live region', async () => {
    const { rerender } = render(<EmailStep onSubmit={() => {}} pending={false} error={null} />);
    // Mounted before it has content, so the announcement actually fires.
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(<EmailStep onSubmit={() => {}} pending={false} error="Terlalu sering mencoba." />);
    expect(screen.getByRole('alert').textContent).toBe('Terlalu sering mencoba.');
  });
});

describe('otp step', () => {
  it('uses one labelled field with one-time-code autofill', () => {
    render(
      <OtpStep
        email="a@b.test"
        onVerify={() => {}}
        onResend={() => {}}
        onBack={() => {}}
        pending={false}
        error={null}
        sentAt={1}
      />,
    );

    const input = screen.getByLabelText('Kode 6 digit');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    // Six separate boxes would announce six unlabelled inputs to a reader.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('holds the resend button for a minute, then releases it', async () => {
    vi.useFakeTimers();
    render(
      <OtpStep
        email="a@b.test"
        onVerify={() => {}}
        onResend={() => {}}
        onBack={() => {}}
        pending={false}
        error={null}
        sentAt={1}
      />,
    );

    const resend = screen.getByRole('button', { name: /kirim ulang kode dalam 60 detik/i });
    expect((resend as HTMLButtonElement).disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(
      (screen.getByRole('button', { name: 'Kirim ulang kode' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('keeps non-digits out of the code field', async () => {
    const user = userEvent.setup();
    render(
      <OtpStep
        email="a@b.test"
        onVerify={() => {}}
        onResend={() => {}}
        onBack={() => {}}
        pending={false}
        error={null}
        sentAt={1}
      />,
    );

    await user.type(screen.getByLabelText('Kode 6 digit'), '12a3b4');
    expect((screen.getByLabelText('Kode 6 digit') as HTMLInputElement).value).toBe('1234');
  });
});

describe('age gate', () => {
  it('keeps the continue button off until the box is ticked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<AgeGate onConfirm={onConfirm} onReject={() => {}} pending={false} error={null} />);

    const button = screen.getByRole('button', { name: 'Lanjut' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await user.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);

    await user.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('offers an honest way out, not only the way forward', () => {
    render(<AgeGate onConfirm={() => {}} onReject={() => {}} pending={false} error={null} />);
    expect(screen.getByRole('button', { name: 'Umurku belum 18' })).toBeTruthy();
  });
});

describe('under-18 screen', () => {
  it('thanks rather than blames, and points somewhere real', () => {
    render(<AgeBlocked onHome={() => {}} />);

    const text = document.body.textContent ?? '';
    expect(text).toMatch(/makasih udah jujur/i);
    // Copy review, encoded: nothing that reads as an accusation, and no
    // "try again tomorrow" — the cooldown is an anti-retry measure, not an
    // invitation to answer differently later.
    expect(text).not.toMatch(/bohong|curang|melanggar|dilarang|coba lagi besok/i);
    expect(text).toMatch(/orang dewasa yang kamu percaya/i);
  });
});

describe('the flow end to end (mocked API)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('requests a code, verifies it, then asks about age', async () => {
    const user = userEvent.setup();
    const fetchSpy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.includes('/auth/otp/request')) return ok({ status: 'sent' });
      if (url.includes('/auth/otp/verify')) return ok({ accessToken: 'token-123' });
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND', 'belum onboarding');
      return ok({});
    });

    const { default: AuthPage } = await import('../app/(app)/auth/page');
    const { SessionProvider } = await import('../lib/session');

    render(
      <SessionProvider>
        <AuthPage />
      </SessionProvider>,
    );

    await user.type(screen.getByLabelText('Email'), 'seseorang@contoh.test');
    await user.click(screen.getByRole('button', { name: 'Kirim Kode' }));

    await screen.findByRole('heading', { name: 'Masukin kodenya' });

    await user.type(screen.getByLabelText('Kode 6 digit'), '123456');
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    await screen.findByRole('heading', { name: 'Sebelum lanjut' });

    const requested = requestsOf(fetchSpy);
    expect(requested).toContain('POST /v1/auth/otp/request');
    expect(requested).toContain('POST /v1/auth/otp/verify');
  });

  it('tells the server when someone says they are under 18', async () => {
    const user = userEvent.setup();
    const fetchSpy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND');
      if (url.includes('/auth/otp/request')) return ok({ status: 'sent' });
      if (url.includes('/auth/otp/verify')) return ok({ accessToken: 'token-123' });
      if (url.endsWith('/v1/onboarding')) return err(403, 'AGE_GATE_REJECTED');
      return ok({});
    });

    const { default: AuthPage } = await import('../app/(app)/auth/page');
    const { SessionProvider } = await import('../lib/session');

    render(
      <SessionProvider>
        <AuthPage />
      </SessionProvider>,
    );

    await user.type(screen.getByLabelText('Email'), 'seseorang@contoh.test');
    await user.click(screen.getByRole('button', { name: 'Kirim Kode' }));
    await screen.findByRole('heading', { name: 'Masukin kodenya' });
    await user.type(screen.getByLabelText('Kode 6 digit'), '123456');
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    await screen.findByRole('heading', { name: 'Sebelum lanjut' });

    await user.click(screen.getByRole('button', { name: 'Umurku belum 18' }));

    // The declaration is reported, which is what puts the device on the 24-hour
    // cooldown. Handling it purely client-side would make the honest answer the
    // only one with a consequence.
    await waitFor(() => {
      expect(requestsOf(fetchSpy)).toContain('POST /v1/onboarding');
    });
    expect(bodyOf(fetchSpy, 'POST /v1/onboarding')).toMatchObject({ isAdult: false });

    await screen.findByRole('heading', { name: /makasih udah jujur/i });
  });
});
