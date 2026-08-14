import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ApiError, NetworkError, api } from '../lib/api';
import { AUTH_FALLBACK, ERROR_COPY, PASSWORD_MIN_LENGTH } from '../lib/auth-copy';
import { useSession } from '../lib/session';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../components/ui';
import { TOUCH_TARGET } from '../lib/tokens';

/**
 * `/auth` — E16-T03, revised for password login (Revisi 1, Aug 2026).
 * DESIGN-REF §2.2, TECH-SPEC §5.4.
 *
 * Same steps as the web: password login is the default (the login that sends
 * no email), OTP is one tap away and is still how accounts are created and
 * recovered, and anyone landing without a password is walked through creating
 * one before the age gate. Copy lives in `lib/auth-copy.ts`, kept identical to
 * the web by `auth-copy.test.ts`.
 */

const REASSURANCE = 'Email kamu nggak akan pernah ditampilkan ke siapa pun.';

type Step = 'login' | 'email' | 'otp' | 'password-create' | 'age' | 'blocked';

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  isNewUser: boolean;
  hasPassword: boolean;
  /** False until onboarding completes (E04) — the whole reason to show the age gate. */
  hasProfile: boolean;
}

export default function AuthScreen() {
  const router = useRouter();
  const { signedIn, endedMessage, clearEndedMessage } = useSession();

  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "Lupa password?" — forces the create step even when a password exists. */
  const [resetIntent, setResetIntent] = useState(false);
  /** Accounts that existed before this login may defer the create step. */
  const [mayDefer, setMayDefer] = useState(false);
  /** Carried across the password step so the age gate can still be skipped after it. */
  const [profileComplete, setProfileComplete] = useState(false);

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof NetworkError) {
      setError('Koneksi lagi bermasalah. Coba lagi ya.');
      return;
    }
    const code = cause instanceof ApiError ? cause.code : null;
    setError((code && ERROR_COPY[code]) || AUTH_FALLBACK);
  }, []);

  /**
   * Where a finished login lands.
   *
   * The age gate gates *onboarding*, not signing in: it decides whether an
   * account may be set up at all. Someone who already has a profile answered
   * it once, and asking again on every login misrepresents what the question
   * is for. `hasProfile` is what the API has always sent to say so.
   */
  const finishLogin = useCallback(
    (hasProfile: boolean) => {
      if (hasProfile) {
        router.replace('/');
        return;
      }
      setStep('age');
    },
    [router],
  );

  const afterTokens = useCallback(
    async (tokens: AuthTokens) => {
      await signedIn(tokens);
      setProfileComplete(tokens.hasProfile);
      // Password before age gate — the session is seconds old, which is what
      // the set-password endpoint accepts as re-auth (forgot-password path).
      if (!tokens.hasPassword || resetIntent) {
        setMayDefer(!tokens.isNewUser && !resetIntent);
        setError(null);
        setStep('password-create');
        return;
      }
      finishLogin(tokens.hasProfile);
    },
    [signedIn, resetIntent, finishLogin],
  );

  const loginWithPassword = useCallback(async () => {
    setPending(true);
    setError(null);
    clearEndedMessage();
    try {
      const { data } = await api<AuthTokens>('/auth/password/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      await afterTokens(data);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }, [afterTokens, clearEndedMessage, email, fail, password]);

  const sendCode = useCallback(async () => {
    setPending(true);
    setError(null);
    clearEndedMessage();
    try {
      await api('/auth/otp/request', { method: 'POST', body: { email: email.trim() } });
      setStep('otp');
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }, [clearEndedMessage, email, fail]);

  const verify = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const { data } = await api<AuthTokens>('/auth/otp/verify', {
        method: 'POST',
        body: { email: email.trim(), code: code.trim() },
      });
      await afterTokens(data);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }, [afterTokens, code, email, fail]);

  const savePassword = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      // Fresh session, so no currentPassword — this same call is both the
      // first-time set and the forgot-password reset.
      await api('/auth/password', { method: 'POST', body: { password: newPassword } });
      setResetIntent(false);
      finishLogin(profileComplete);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }, [fail, finishLogin, newPassword, profileComplete]);

  const rejectAge = useCallback(async () => {
    try {
      // Reported so the 24-hour cooldown is applied server-side. Handling it
      // only on the device would make the honest answer the only one with a
      // consequence.
      await api('/onboarding', {
        method: 'POST',
        body: { isAdult: false, consents: [{ consentType: 'tos_privacy', granted: false }] },
      });
    } catch {
      /* expected: AGE_GATE_REJECTED */
    }
    setStep('blocked');
  }, []);

  return (
    <ScreenScroll>
      {endedMessage ? (
        <View className="rounded-curhat bg-surface p-4">
          <Text accessibilityLiveRegion="polite" className="text-sm text-text">
            {endedMessage}
          </Text>
        </View>
      ) : null}

      {step === 'login' ? (
        <>
          <Heading>Masuk</Heading>
          <Body muted>
            Belum punya akun? Pilih “Masuk pakai kode email” di bawah — akunmu dibuat dari sana.
          </Body>

          <Text className="text-sm font-bold text-text">Email</Text>
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat bg-surface px-4 text-text"
          />
          <Text className="text-sm text-muted">{REASSURANCE}</Text>

          <Text className="text-sm font-bold text-text">Password</Text>
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            autoComplete="current-password"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat bg-surface px-4 text-text"
          />

          <ErrorText message={error} />
          <PrimaryButton
            label={pending ? 'Lagi masuk…' : 'Masuk'}
            disabled={pending || email.trim().length === 0 || password.length === 0}
            onPress={() => void loginWithPassword()}
          />
          <SecondaryButton
            label="Masuk pakai kode email"
            onPress={() => {
              setResetIntent(false);
              setError(null);
              setStep('email');
            }}
          />
          <SecondaryButton
            label="Lupa password?"
            onPress={() => {
              // Forgot-password IS the OTP path plus the intent to set a new
              // one after — no separate reset machinery.
              setResetIntent(true);
              setError(null);
              setStep('email');
            }}
          />
        </>
      ) : null}

      {step === 'email' ? (
        <>
          <Heading>Masuk pakai kode email</Heading>
          <Body muted>Kami kirim kode 6 digit ke emailmu.</Body>

          <Text className="text-sm font-bold text-text">Email</Text>
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat bg-surface px-4 text-text"
          />
          <Text className="text-sm text-muted">{REASSURANCE}</Text>

          <ErrorText message={error} />
          <PrimaryButton
            label={pending ? 'Lagi dikirim…' : 'Kirim Kode'}
            disabled={pending || email.trim().length === 0}
            onPress={() => void sendCode()}
          />
          <SecondaryButton
            label="Masuk pakai password"
            onPress={() => {
              setError(null);
              setStep('login');
            }}
          />
        </>
      ) : null}

      {step === 'otp' ? (
        <>
          <Heading>Masukin kodenya</Heading>
          <Body muted>Kode 6 digit sudah kami kirim ke {email}. Cek folder spam juga ya.</Body>

          <Text className="text-sm font-bold text-text">Kode 6 digit</Text>
          <TextInput
            accessibilityLabel="Kode 6 digit"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            // Lets Android offer the code from the SMS/email autofill.
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat bg-surface px-4 text-center text-xl tracking-[8px] text-text"
          />

          <ErrorText message={error} />
          <PrimaryButton
            label={pending ? 'Lagi dicek…' : 'Lanjut'}
            disabled={pending || code.length !== 6}
            onPress={() => void verify()}
          />
          <SecondaryButton label="Ganti email" onPress={() => setStep('email')} />
        </>
      ) : null}

      {step === 'password-create' ? (
        <>
          <Heading>Bikin password dulu ya</Heading>
          <Body muted>Biar masuk berikutnya nggak perlu nunggu kode email.</Body>

          <Text className="text-sm font-bold text-text">Password baru</Text>
          <TextInput
            accessibilityLabel="Password baru"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNewPassword}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="new-password"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat bg-surface px-4 text-text"
          />
          <Text className="text-sm text-muted">Minimal {PASSWORD_MIN_LENGTH} karakter.</Text>

          <SecondaryButton
            label={showNewPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            onPress={() => setShowNewPassword((value) => !value)}
          />

          <ErrorText message={error} />
          <PrimaryButton
            label={pending ? 'Lagi disimpan…' : 'Simpan Password'}
            disabled={pending || newPassword.length < PASSWORD_MIN_LENGTH}
            onPress={() => void savePassword()}
          />
          {mayDefer ? (
            <SecondaryButton
              label="Nanti aja"
              onPress={() => {
                setError(null);
                finishLogin(profileComplete);
              }}
            />
          ) : null}
        </>
      ) : null}

      {step === 'age' ? (
        <>
          <Heading>Sebelum lanjut</Heading>
          <Body muted>
            CURHAT DONG ditujukan untuk 18 tahun ke atas. Bukan karena ceritamu nggak penting kalau
            kamu lebih muda — tapi karena di sini orang bercerita soal hal-hal berat, dan kami belum
            bisa mendampingi anak di bawah umur dengan layak.
          </Body>

          <PrimaryButton
            label="Iya, umurku 18 tahun ke atas"
            accessibilityLabel="Konfirmasi umur 18 tahun ke atas"
            disabled={pending}
            // The declaration travels with the onboarding submit, where the
            // server checks it (onboarding.service.ts).
            onPress={() => router.replace('/onboarding')}
          />

          <SecondaryButton label="Umurku belum 18" onPress={() => void rejectAge()} />
        </>
      ) : null}

      {step === 'blocked' ? (
        <>
          <Heading>Makasih udah jujur 🤍</Heading>
          <Body>
            CURHAT DONG memang dibatasi untuk 18 tahun ke atas, jadi kami belum bisa nemenin kamu di
            sini sekarang.
          </Body>
          <Body muted>
            Bukan berarti yang kamu rasain nggak penting. Kalau lagi berat, cerita ke orang dewasa
            yang kamu percaya — guru BK, keluarga, atau layanan konseling remaja di sekitarmu.
          </Body>
        </>
      ) : null}
    </ScreenScroll>
  );
}
