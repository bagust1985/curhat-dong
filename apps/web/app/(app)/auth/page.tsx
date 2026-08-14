'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { ErrorCode } from '@curhat/types';

import { ApiError, NetworkError, api } from '../../../lib/api';
import { authErrorMessage } from '../../../lib/auth-copy';
import { useSession } from '../../../lib/session';
import {
  AgeBlocked,
  AgeGate,
  EmailStep,
  OtpStep,
  PasswordCreateStep,
  PasswordLoginStep,
} from '../../../components/auth';
import { GoogleSignIn } from '../../../components/google-signin';
import { Turnstile } from '../../../components/turnstile';

/**
 * `/auth` — E15-T06, revised for password login (Revisi 1, Aug 2026).
 * DESIGN-REF §2.2, TECH-SPEC §5.4.
 *
 * One route, six steps, because they are one decision from the user's side and
 * a half-finished login should not leave a URL that can be bookmarked and
 * returned to out of order.
 *
 * The default screen is email+password — the login that sends no email. OTP is
 * one tap away and is still how accounts are created and recovered. After an
 * OTP or Google login, anyone without a password lands on the create step
 * *before* the age gate: it has to happen while still inside /auth, and the
 * session is minutes old, which is exactly what lets a forgotten password be
 * replaced without knowing the old one.
 *
 * The age gate sits here rather than inside onboarding because it decides
 * whether onboarding may start at all (DESIGN-REF §2.2c). Saying "belum 18"
 * tells the server so — that is what puts the device on a 24-hour cooldown
 * (onboarding.service.ts), and skipping the call would make the honest answer
 * the one with no consequence and the dishonest one free.
 */

type Step = 'login' | 'email' | 'otp' | 'password-create' | 'age' | 'blocked';

interface AuthTokens {
  accessToken: string;
  isNewUser: boolean;
  hasPassword: boolean;
  /** False until onboarding completes (E04) — the whole reason to show the age gate. */
  hasProfile: boolean;
}

export default function AuthPage() {
  const router = useRouter();
  const { signedIn } = useSession();

  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsChallenge, setNeedsChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  /** "Lupa password?" — forces the create step even for accounts that have one. */
  const [resetIntent, setResetIntent] = useState(false);
  /** True when the account existed before this login — those may defer the create step. */
  const [mayDeferPassword, setMayDeferPassword] = useState(false);
  /** Carried across the password step so the age gate can still be skipped after it. */
  const [profileComplete, setProfileComplete] = useState(false);

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof NetworkError) {
      setError('Koneksi lagi bermasalah. Coba lagi ya.');
      return;
    }
    const code = cause instanceof ApiError ? cause.code : null;
    if (code === 'AUTH_TURNSTILE_REQUIRED' || code === 'AUTH_TURNSTILE_INVALID') {
      setNeedsChallenge(true);
    }
    setError(authErrorMessage(code as ErrorCode | null));
  }, []);

  const sendCode = useCallback(
    async (address: string) => {
      setPending(true);
      setError(null);
      try {
        await api('/auth/otp/request', {
          method: 'POST',
          body: {
            email: address,
            ...(turnstileToken ? { turnstileToken } : {}),
          },
        });
        setEmail(address);
        setSentAt((value) => value + 1);
        setStep('otp');
        setNeedsChallenge(false);
      } catch (cause) {
        fail(cause);
      } finally {
        setPending(false);
      }
    },
    [fail, turnstileToken],
  );

  /**
   * Where a finished login lands.
   *
   * The age gate is a gate on *onboarding*, not on signing in: it decides
   * whether an account may be set up at all (DESIGN-REF §2.2c). Someone who
   * already has a profile answered it once, and asking again every login is
   * both a lie about what the question is for and a tax on the person the
   * product exists for. `hasProfile` is what the API has always sent to say so.
   */
  const finishLogin = useCallback(
    (hasProfile: boolean) => {
      if (hasProfile) {
        // replace, not push: /auth must not sit in the back stack behind /home.
        router.replace('/home');
        return;
      }
      setStep('age');
    },
    [router],
  );

  const afterTokens = useCallback(
    async (tokens: AuthTokens) => {
      await signedIn(tokens.accessToken);
      setProfileComplete(tokens.hasProfile);

      // Password before age gate: it must happen while still inside /auth,
      // and the session is seconds old — which is what the change-password
      // endpoint accepts as re-authentication (the forgot-password path).
      if (!tokens.hasPassword || resetIntent) {
        setMayDeferPassword(!tokens.isNewUser && !resetIntent);
        setError(null);
        setStep('password-create');
        return;
      }

      finishLogin(tokens.hasProfile);
    },
    [signedIn, resetIntent, finishLogin],
  );

  const loginWithPassword = useCallback(
    async (address: string, password: string) => {
      setPending(true);
      setError(null);
      try {
        const { data } = await api<AuthTokens>('/auth/password/login', {
          method: 'POST',
          body: {
            email: address,
            password,
            ...(turnstileToken ? { turnstileToken } : {}),
          },
        });
        setEmail(address);
        setNeedsChallenge(false);
        await afterTokens(data);
      } catch (cause) {
        fail(cause);
      } finally {
        setPending(false);
      }
    },
    [afterTokens, fail, turnstileToken],
  );

  const verifyCode = useCallback(
    async (code: string) => {
      setPending(true);
      setError(null);
      try {
        const { data } = await api<AuthTokens>('/auth/otp/verify', {
          method: 'POST',
          body: { email, code },
        });
        await afterTokens(data);
      } catch (cause) {
        fail(cause);
      } finally {
        setPending(false);
      }
    },
    [afterTokens, email, fail],
  );

  const withGoogle = useCallback(
    async (idToken: string) => {
      setPending(true);
      setError(null);
      try {
        const { data } = await api<AuthTokens>('/auth/google', {
          method: 'POST',
          body: { idToken },
        });
        await afterTokens(data);
      } catch (cause) {
        fail(cause);
      } finally {
        setPending(false);
      }
    },
    [afterTokens, fail],
  );

  const savePassword = useCallback(
    async (password: string) => {
      setPending(true);
      setError(null);
      try {
        // The session is fresh (we just logged in), so no currentPassword is
        // needed — this same call is both first-time set and forgot-reset.
        await api('/auth/password', { method: 'POST', body: { password } });
        setResetIntent(false);
        finishLogin(profileComplete);
      } catch (cause) {
        fail(cause);
      } finally {
        setPending(false);
      }
    },
    [fail, finishLogin, profileComplete],
  );

  const confirmAdult = useCallback(() => {
    // The declaration travels with the onboarding submit (E15-T07), where the
    // server checks it. Carrying it in the URL keeps it out of storage.
    router.push('/onboarding');
  }, [router]);

  const rejectAdult = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await api('/onboarding', {
        method: 'POST',
        body: {
          isAdult: false,
          // Answered honestly: shown, not granted. The server records refusals
          // as carefully as grants (PRD §25.3).
          consents: [{ consentType: 'tos_privacy', granted: false }],
        },
      });
    } catch {
      // Expected: AGE_GATE_REJECTED. Either way the person told us they are
      // under 18, so the screen is the same.
    } finally {
      setPending(false);
      setStep('blocked');
    }
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md px-[var(--spacing-gutter)] py-12">
      {step === 'login' ? (
        <PasswordLoginStep
          onSubmit={(address, password) => void loginWithPassword(address, password)}
          onUseOtp={() => {
            setResetIntent(false);
            setError(null);
            setStep('email');
          }}
          onForgot={() => {
            // Forgot-password IS the OTP path, plus the intent to set a new
            // one after — no separate reset machinery to build or attack.
            setResetIntent(true);
            setError(null);
            setStep('email');
          }}
          pending={pending}
          error={error}
          challenge={
            needsChallenge ? (
              <Turnstile
                onToken={setTurnstileToken}
                onError={() => setError(authErrorMessage('AUTH_TURNSTILE_INVALID'))}
              />
            ) : null
          }
          google={<GoogleSignIn onCredential={(token) => void withGoogle(token)} />}
        />
      ) : null}

      {step === 'email' ? (
        <EmailStep
          onSubmit={(address) => void sendCode(address)}
          pending={pending}
          error={error}
          challenge={
            needsChallenge ? (
              <Turnstile
                onToken={setTurnstileToken}
                onError={() => setError(authErrorMessage('AUTH_TURNSTILE_INVALID'))}
              />
            ) : null
          }
          google={<GoogleSignIn onCredential={(token) => void withGoogle(token)} />}
        />
      ) : null}

      {step === 'otp' ? (
        <OtpStep
          email={email}
          onVerify={(code) => void verifyCode(code)}
          onResend={() => void sendCode(email)}
          onBack={() => {
            setStep('email');
            setError(null);
          }}
          pending={pending}
          error={error}
          sentAt={sentAt}
        />
      ) : null}

      {step === 'password-create' ? (
        <PasswordCreateStep
          onSubmit={(password) => void savePassword(password)}
          allowSkip={mayDeferPassword}
          onSkip={() => {
            setError(null);
            finishLogin(profileComplete);
          }}
          pending={pending}
          error={error}
        />
      ) : null}

      {step === 'age' ? (
        <AgeGate
          onConfirm={confirmAdult}
          onReject={() => void rejectAdult()}
          pending={pending}
          error={error}
        />
      ) : null}

      {step === 'blocked' ? <AgeBlocked onHome={() => router.push('/')} /> : null}
    </main>
  );
}
