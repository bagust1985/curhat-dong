'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { ErrorCode } from '@curhat/types';

import { ApiError, NetworkError, api } from '../../../lib/api';
import { authErrorMessage } from '../../../lib/auth-copy';
import { useSession } from '../../../lib/session';
import { AgeBlocked, AgeGate, EmailStep, OtpStep } from '../../../components/auth';
import { GoogleSignIn } from '../../../components/google-signin';
import { Turnstile } from '../../../components/turnstile';

/**
 * `/auth` — E15-T06. DESIGN-REF §2.2.
 *
 * Four steps in one route: email → code → 18+ → (blocked). One route because
 * they are one decision from the user's side, and a half-finished login should
 * not leave a URL that can be bookmarked and returned to out of order.
 *
 * The age gate sits here rather than inside onboarding because it decides
 * whether onboarding may start at all (DESIGN-REF §2.2c). Saying "belum 18"
 * tells the server so — that is what puts the device on a 24-hour cooldown
 * (onboarding.service.ts), and skipping the call would make the honest answer
 * the one with no consequence and the dishonest one free.
 */

type Step = 'email' | 'otp' | 'age' | 'blocked';

interface AuthTokens {
  accessToken: string;
}

export default function AuthPage() {
  const router = useRouter();
  const { signedIn } = useSession();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsChallenge, setNeedsChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);

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

  const afterTokens = useCallback(
    async (tokens: AuthTokens) => {
      await signedIn(tokens.accessToken);
      // Age gate before onboarding: the account exists now, but nothing has
      // been collected about the person yet.
      setStep('age');
    },
    [signedIn],
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
