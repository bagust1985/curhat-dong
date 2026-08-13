import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ApiError, NetworkError, api } from '../lib/api';
import { useSession } from '../lib/session';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../components/ui';
import { TOUCH_TARGET } from '../lib/tokens';

/**
 * `/auth` — E16-T03. DESIGN-REF §2.2.
 *
 * Same three steps as the web (email → code → 18+) and the same rule about what
 * the error messages may say: nothing that reveals whether an address has an
 * account. The copy is duplicated rather than imported because
 * `apps/web/lib/auth-copy.ts` is a web module; `auth-copy.test.ts` asserts the
 * two lists stay identical.
 */

const REASSURANCE = 'Email kamu nggak akan pernah ditampilkan ke siapa pun.';

const ERROR_COPY: Record<string, string> = {
  AUTH_OTP_INVALID: 'Kodenya nggak cocok. Coba cek lagi ya.',
  AUTH_OTP_EXPIRED: 'Kode ini sudah kedaluwarsa. Minta kode baru ya.',
  AUTH_OTP_TOO_MANY_ATTEMPTS:
    'Percobaannya sudah terlalu banyak. Tunggu sebentar, lalu minta kode baru.',
  RATE_LIMITED: 'Terlalu sering mencoba. Istirahat sebentar, lalu coba lagi ya.',
  AUTH_TURNSTILE_REQUIRED: 'Bantu kami pastikan kamu bukan robot dulu ya.',
  AUTH_TURNSTILE_INVALID: 'Verifikasinya belum berhasil. Coba sekali lagi ya.',
  AUTH_GOOGLE_TOKEN_INVALID: 'Login Google-nya nggak selesai. Coba lagi ya.',
  VALIDATION_ERROR: 'Alamat emailnya kelihatan belum benar. Coba cek lagi ya.',
  SERVICE_UNAVAILABLE: 'Layanannya lagi istirahat sebentar. Coba lagi ya.',
};

const FALLBACK = 'Ada yang nggak beres. Coba lagi sebentar lagi ya.';

export default function AuthScreen() {
  const router = useRouter();
  const { signedIn, endedMessage, clearEndedMessage } = useSession();

  const [step, setStep] = useState<'email' | 'otp' | 'age' | 'blocked'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof NetworkError) {
      setError('Koneksi lagi bermasalah. Coba lagi ya.');
      return;
    }
    const code = cause instanceof ApiError ? cause.code : null;
    setError((code && ERROR_COPY[code]) || FALLBACK);
  }, []);

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
      const { data } = await api<{ accessToken: string; refreshToken?: string }>(
        '/auth/otp/verify',
        { method: 'POST', body: { email: email.trim(), code: code.trim() } },
      );
      await signedIn(data);
      setStep('age');
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }, [code, email, fail, signedIn]);

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
        <View className="rounded-curhat border border-border bg-surface p-4">
          <Text accessibilityLiveRegion="polite" className="text-sm text-text">
            {endedMessage}
          </Text>
        </View>
      ) : null}

      {step === 'email' ? (
        <>
          <Heading>Masuk atau bikin akun</Heading>
          <Body muted>Kami kirim kode 6 digit ke emailmu. Nggak perlu password.</Body>

          <Text className="text-sm font-semibold text-text">Email</Text>
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat border border-border bg-surface px-4 text-text"
          />
          <Text className="text-sm text-muted">{REASSURANCE}</Text>

          <ErrorText message={error} />
          <PrimaryButton
            label={pending ? 'Lagi dikirim…' : 'Kirim Kode'}
            disabled={pending || email.trim().length === 0}
            onPress={() => void sendCode()}
          />
        </>
      ) : null}

      {step === 'otp' ? (
        <>
          <Heading>Masukin kodenya</Heading>
          <Body muted>Kode 6 digit sudah kami kirim ke {email}. Cek folder spam juga ya.</Body>

          <Text className="text-sm font-semibold text-text">Kode 6 digit</Text>
          <TextInput
            accessibilityLabel="Kode 6 digit"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            // Lets Android offer the code from the SMS/email autofill.
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat border border-border bg-surface px-4 text-center text-xl tracking-[8px] text-text"
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
