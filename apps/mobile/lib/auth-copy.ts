/**
 * Auth error copy — E16-T03, extended for password login (Revisi 1, Aug 2026).
 *
 * Duplicated from `apps/web/lib/auth-copy.ts` rather than imported, because
 * that is a web module and this package resolves through Metro. The
 * duplication is safe to live with only because `auth-copy.test.ts` imports
 * both files and fails when the lists drift.
 *
 * Same hard rule as the web: none of these sentences may reveal whether an
 * email address has an account here.
 */
export const ERROR_COPY: Record<string, string> = {
  AUTH_OTP_INVALID: 'Kodenya nggak cocok. Coba cek lagi ya.',
  AUTH_OTP_EXPIRED: 'Kode ini sudah kedaluwarsa. Minta kode baru ya.',
  AUTH_OTP_TOO_MANY_ATTEMPTS:
    'Percobaannya sudah terlalu banyak. Tunggu sebentar, lalu minta kode baru.',
  RATE_LIMITED: 'Terlalu sering mencoba. Istirahat sebentar, lalu coba lagi ya.',
  AUTH_TURNSTILE_REQUIRED: 'Bantu kami pastikan kamu bukan robot dulu ya.',
  AUTH_TURNSTILE_INVALID: 'Verifikasinya belum berhasil. Coba sekali lagi ya.',
  AUTH_GOOGLE_TOKEN_INVALID: 'Login Google-nya nggak selesai. Coba lagi ya.',
  AUTH_CREDENTIALS_INVALID: 'Email atau password-nya nggak cocok. Coba cek lagi ya.',
  AUTH_PASSWORD_WEAK: 'Password-nya minimal 8 karakter, dan jangan sama dengan email kamu ya.',
  VALIDATION_ERROR: 'Alamat emailnya kelihatan belum benar. Coba cek lagi ya.',
  SERVICE_UNAVAILABLE: 'Layanannya lagi istirahat sebentar. Coba lagi ya.',
};

export const AUTH_FALLBACK = 'Ada yang nggak beres. Coba lagi sebentar lagi ya.';

/** Mirrors `PASSWORD_MIN_LENGTH` in the API's auth.dto.ts. */
export const PASSWORD_MIN_LENGTH = 8;
