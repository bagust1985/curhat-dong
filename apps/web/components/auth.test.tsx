import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgeBlocked,
  AgeGate,
  EmailStep,
  OtpStep,
  PasswordCreateStep,
  PasswordLoginStep,
} from './auth';
import {
  AUTH_ERROR_COPY,
  AUTH_ERROR_FALLBACK,
  ENUMERATION_TELLS,
  authErrorMessage,
} from '../lib/auth-copy';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

/** A fully set-up account: the shape `GET /me` returns once onboarding is done. */
const ONBOARDED = {
  alias: 'senja.tenang',
  avatar: null,
  bio: null,
  isListener: false,
  joinedAt: '2026-01-01T00:00:00Z',
  helpfulCount: 0,
  hasCompletedOnboarding: true,
  topics: [],
};

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

describe('password login step (Revisi 1)', () => {
  const noop = () => {};

  it('is a plain email+password form with both escape hatches', () => {
    render(
      <PasswordLoginStep
        onSubmit={noop}
        onUseOtp={noop}
        onForgot={noop}
        pending={false}
        error={null}
      />,
    );

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Masuk pakai kode email' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lupa password?' })).toBeTruthy();
  });

  it('submits the trimmed email and the password as typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <PasswordLoginStep
        onSubmit={onSubmit}
        onUseOtp={noop}
        onForgot={noop}
        pending={false}
        error={null}
      />,
    );

    await user.type(screen.getByLabelText('Email'), '  a@b.test  ');
    await user.type(screen.getByLabelText('Password'), ' rahasia-8 ');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    // Password is NOT trimmed: a leading space in a password is a choice.
    expect(onSubmit).toHaveBeenCalledWith('a@b.test', ' rahasia-8 ');
  });

  it('says nothing that reveals whether an address has an account', () => {
    render(
      <PasswordLoginStep
        onSubmit={noop}
        onUseOtp={noop}
        onForgot={noop}
        pending={false}
        error={null}
      />,
    );
    const text = document.body.textContent ?? '';
    for (const tell of ENUMERATION_TELLS) {
      expect(text, `screen copy vs ${tell}`).not.toMatch(tell);
    }
  });
});

describe('password create step (Revisi 1)', () => {
  const noop = () => {};

  it('keeps the submit off until the password reaches 8 characters', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <PasswordCreateStep
        onSubmit={onSubmit}
        allowSkip={false}
        pending={false}
        error={null}
      />,
    );

    const button = screen.getByRole('button', { name: 'Simpan Password' }) as HTMLButtonElement;
    await user.type(screen.getByLabelText('Password baru'), 'pendek7');
    expect(button.disabled).toBe(true);

    await user.type(screen.getByLabelText('Password baru'), '8');
    expect(button.disabled).toBe(false);

    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith('pendek78');
  });

  it('has a show/hide toggle that reports its state', async () => {
    const user = userEvent.setup();
    render(
      <PasswordCreateStep
        onSubmit={noop}
        allowSkip={false}
        pending={false}
        error={null}
      />,
    );

    const field = screen.getByLabelText('Password baru') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Tampilkan' });
    expect(field.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await user.click(toggle);
    expect(field.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Sembunyikan' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('only offers "Nanti aja" to accounts that may defer', () => {
    const { rerender } = render(
      <PasswordCreateStep
        onSubmit={noop}
        allowSkip={false}
        onSkip={noop}
        pending={false}
        error={null}
      />,
    );
    // New registrations may not skip: the password is the point of Revisi 1.
    expect(screen.queryByRole('button', { name: 'Nanti aja' })).toBeNull();

    rerender(
      <PasswordCreateStep
        onSubmit={noop}
        allowSkip={true}
        onSkip={noop}
        pending={false}
        error={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Nanti aja' })).toBeTruthy();
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

  it('never re-asks the age gate of somebody who already has a profile', async () => {
    // The age gate gates *onboarding*, not signing in. Asking a returning user
    // to tick "I am 18+" on every single login misrepresents what the question
    // is for — and became a daily tax the moment password login made logging
    // in routine. The API has always sent `hasProfile`; this reads it.
    const user = userEvent.setup();
    const fetchSpy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.includes('/auth/password/login'))
        return ok({
          accessToken: 'token-123',
          isNewUser: false,
          hasPassword: true,
          hasProfile: true,
        });
      if (url.endsWith('/v1/me')) return ok(ONBOARDED);
      return ok({});
    });

    const { default: AuthPage } = await import('../app/(app)/auth/page');
    const { SessionProvider } = await import('../lib/session');

    render(
      <SessionProvider>
        <AuthPage />
      </SessionProvider>,
    );

    await user.type(screen.getByLabelText('Email'), 'lama@contoh.test');
    await user.type(screen.getByLabelText('Password'), 'rahasia-yang-panjang');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
    expect(screen.queryByRole('heading', { name: 'Sebelum lanjut' })).toBeNull();
    expect(requestsOf(fetchSpy)).toContain('POST /v1/auth/password/login');
  });

  it('still asks a brand-new account, and lands it on onboarding', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.includes('/auth/password/login'))
        return ok({
          accessToken: 'token-123',
          isNewUser: false,
          hasPassword: true,
          hasProfile: false,
        });
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

    await user.type(screen.getByLabelText('Email'), 'baru@contoh.test');
    await user.type(screen.getByLabelText('Password'), 'rahasia-yang-panjang');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    await screen.findByRole('heading', { name: 'Sebelum lanjut' });
    expect(replace).not.toHaveBeenCalledWith('/home');
  });

  it('logs straight in with a password and sends no email', async () => {
    const user = userEvent.setup();
    const fetchSpy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.includes('/auth/password/login'))
        return ok({ accessToken: 'token-123', isNewUser: false, hasPassword: true });
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
    await user.type(screen.getByLabelText('Password'), 'rahasia-yang-panjang');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));

    await screen.findByRole('heading', { name: 'Sebelum lanjut' });

    const requested = requestsOf(fetchSpy);
    expect(requested).toContain('POST /v1/auth/password/login');
    // The point of the feature: no OTP request anywhere in a routine login.
    expect(requested).not.toContain('POST /v1/auth/otp/request');
  });

  it('registers via OTP, is made to create a password, then asks about age', async () => {
    const user = userEvent.setup();
    const fetchSpy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.includes('/auth/otp/request')) return ok({ status: 'sent' });
      if (url.includes('/auth/otp/verify'))
        return ok({ accessToken: 'token-123', isNewUser: true, hasPassword: false });
      if (url.endsWith('/v1/auth/password')) return ok({ status: 'ok', changed: false });
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

    // OTP is one tap away from the default password screen.
    await user.click(screen.getByRole('button', { name: 'Masuk pakai kode email' }));

    await user.type(screen.getByLabelText('Email'), 'seseorang@contoh.test');
    await user.click(screen.getByRole('button', { name: 'Kirim Kode' }));

    await screen.findByRole('heading', { name: 'Masukin kodenya' });

    await user.type(screen.getByLabelText('Kode 6 digit'), '123456');
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // New account → the create step is mandatory: no "Nanti aja" here.
    await screen.findByRole('heading', { name: 'Bikin password dulu ya' });
    expect(screen.queryByRole('button', { name: 'Nanti aja' })).toBeNull();

    await user.type(screen.getByLabelText('Password baru'), 'password-pertamaku');
    await user.click(screen.getByRole('button', { name: 'Simpan Password' }));

    await screen.findByRole('heading', { name: 'Sebelum lanjut' });

    const requested = requestsOf(fetchSpy);
    expect(requested).toContain('POST /v1/auth/otp/request');
    expect(requested).toContain('POST /v1/auth/otp/verify');
    expect(requested).toContain('POST /v1/auth/password');
    expect(bodyOf(fetchSpy, 'POST /v1/auth/password')).toEqual({
      password: 'password-pertamaku',
    });
  });

  it('lets an existing account without a password defer the create step', async () => {
    const user = userEvent.setup();
    stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.includes('/auth/otp/request')) return ok({ status: 'sent' });
      if (url.includes('/auth/otp/verify'))
        return ok({ accessToken: 'token-123', isNewUser: false, hasPassword: false });
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND');
      return ok({});
    });

    const { default: AuthPage } = await import('../app/(app)/auth/page');
    const { SessionProvider } = await import('../lib/session');

    render(
      <SessionProvider>
        <AuthPage />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Masuk pakai kode email' }));
    await user.type(screen.getByLabelText('Email'), 'seseorang@contoh.test');
    await user.click(screen.getByRole('button', { name: 'Kirim Kode' }));
    await screen.findByRole('heading', { name: 'Masukin kodenya' });
    await user.type(screen.getByLabelText('Kode 6 digit'), '123456');
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    // Existing account prompted mid-login: the quiet way out exists...
    await screen.findByRole('heading', { name: 'Bikin password dulu ya' });
    await user.click(screen.getByRole('button', { name: 'Nanti aja' }));

    // ...and it lands on the age gate, not a dead end.
    await screen.findByRole('heading', { name: 'Sebelum lanjut' });
  });

  it('tells the server when someone says they are under 18', async () => {
    const user = userEvent.setup();
    const fetchSpy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) return err(401, 'AUTH_TOKEN_INVALID');
      if (url.endsWith('/v1/me')) return err(404, 'NOT_FOUND');
      if (url.includes('/auth/password/login'))
        return ok({ accessToken: 'token-123', isNewUser: false, hasPassword: true });
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
    await user.type(screen.getByLabelText('Password'), 'rahasia-yang-panjang');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
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
