import type { ErrorCode } from '@curhat/types';

/**
 * What the auth screens say when something goes wrong — E15-T06.
 * DESIGN-REF §2.2, TECH-SPEC §3.1.
 *
 * Kept as a map from error `code` because that is the API's contract; branching
 * on the server's `message` would break the moment somebody rewords it.
 *
 * The hard rule, and the reason this is a closed map rather than "show
 * `error.message`": **none of these may reveal whether an email has an account.**
 * "Kode salah" and "kode kedaluwarsa" are safe — they are about the code the
 * person just typed. "Email tidak terdaftar" would be an account-existence
 * oracle, and on a mental-health platform merely having an account is sensitive.
 * The request endpoint answers 202 for every address for the same reason.
 */
export const AUTH_ERROR_COPY: Partial<Record<ErrorCode, string>> = {
  AUTH_OTP_INVALID: 'Kodenya nggak cocok. Coba cek lagi ya.',
  AUTH_OTP_EXPIRED: 'Kode ini sudah kedaluwarsa. Minta kode baru ya.',
  AUTH_OTP_TOO_MANY_ATTEMPTS:
    'Percobaannya sudah terlalu banyak. Tunggu sebentar, lalu minta kode baru.',
  RATE_LIMITED: 'Terlalu sering mencoba. Istirahat sebentar, lalu coba lagi ya.',
  AUTH_TURNSTILE_REQUIRED: 'Bantu kami pastikan kamu bukan robot dulu ya.',
  AUTH_TURNSTILE_INVALID: 'Verifikasinya belum berhasil. Coba sekali lagi ya.',
  AUTH_GOOGLE_TOKEN_INVALID: 'Login Google-nya nggak selesai. Coba lagi ya.',
  // Deliberately does not say *which* of the two was wrong — the API answers
  // the same for a wrong password and an address that has no account at all.
  AUTH_CREDENTIALS_INVALID: 'Email atau password-nya nggak cocok. Coba cek lagi ya.',
  AUTH_PASSWORD_WEAK: 'Password-nya minimal 8 karakter, dan jangan sama dengan email kamu ya.',
  VALIDATION_ERROR: 'Alamat emailnya kelihatan belum benar. Coba cek lagi ya.',
  SERVICE_UNAVAILABLE: 'Layanannya lagi istirahat sebentar. Coba lagi ya.',
};

/** The catch-all. Vague on purpose: an unknown failure explains nothing useful. */
export const AUTH_ERROR_FALLBACK = 'Ada yang nggak beres. Coba lagi sebentar lagi ya.';

export function authErrorMessage(code: ErrorCode | null | undefined): string {
  return (code && AUTH_ERROR_COPY[code]) || AUTH_ERROR_FALLBACK;
}

/**
 * Anything that would tell an attacker whether an address has an account.
 *
 * Asserted against every string the auth screens can show (see
 * `components/auth.test.tsx`). Enumeration leaks are not usually introduced on
 * purpose — they arrive as a helpful-sounding sentence.
 */
export const ENUMERATION_TELLS: readonly RegExp[] = [
  /belum terdaftar/i,
  /tidak terdaftar/i,
  /sudah terdaftar/i,
  /akun tidak ditemukan/i,
  /email tidak ditemukan/i,
  /buat akun dulu/i,
  /sudah punya akun/i,
];

/** Seconds before "Kirim ulang kode" becomes available again. */
export const RESEND_COOLDOWN_SECONDS = 60;
