'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { RESEND_COOLDOWN_SECONDS } from '../lib/auth-copy';

/**
 * Auth screens — E15-T06. DESIGN-REF §2.2.
 *
 * Presentational only: every one of these takes its error text as a prop and
 * renders it. The mapping from API error code to sentence lives in
 * `lib/auth-copy.ts` so it can be asserted as a closed set — the enumeration
 * rule (TECH-SPEC §3.1) is a property of the whole vocabulary, not of one
 * screen.
 */

const REASSURANCE = 'Email kamu nggak akan pernah ditampilkan ke siapa pun.';

function FieldError({ message }: { message: string | null }) {
  return (
    // Always mounted so a screen reader announces the text when it appears;
    // a live region that is added to the DOM at the same time as its content
    // frequently announces nothing.
    <p role="alert" aria-live="polite" className="mt-2 min-h-5 text-sm text-[var(--color-danger)]">
      {message}
    </p>
  );
}

export interface PasswordLoginStepProps {
  onSubmit: (email: string, password: string) => void;
  /** "Masuk pakai kode email" — the OTP path, also how you register. */
  onUseOtp: () => void;
  /** "Lupa password?" — OTP login, then the create step with reset intent. */
  onForgot: () => void;
  pending: boolean;
  error: string | null;
  /** Rendered under the form when the API demands a bot check. */
  challenge?: React.ReactNode;
  google?: React.ReactNode;
}

/**
 * The default screen since Revisi 1: email + password, no email sent.
 *
 * OTP moved behind "Masuk pakai kode email" — still how registration and
 * recovery work, no longer what every single login costs a Resend email on.
 */
export function PasswordLoginStep({
  onSubmit,
  onUseOtp,
  onForgot,
  pending,
  error,
  challenge,
  google,
}: PasswordLoginStepProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <section aria-labelledby="auth-login-heading">
      <h1 id="auth-login-heading" className="text-2xl font-bold text-[var(--color-text)]">
        Masuk
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Belum punya akun? Pilih “Masuk pakai kode email” di bawah — akunmu dibuat dari sana.
      </p>

      <form
        className="mt-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!pending) onSubmit(email.trim(), password);
        }}
      >
        <label htmlFor="auth-login-email" className="block text-sm font-semibold text-[var(--color-text)]">
          Email
        </label>
        <input
          id="auth-login-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="auth-login-reassurance"
          className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />
        <p id="auth-login-reassurance" className="mt-2 text-sm text-[var(--color-muted)]">
          {REASSURANCE}
        </p>

        <label
          htmlFor="auth-login-password"
          className="mt-4 block text-sm font-semibold text-[var(--color-text)]"
        >
          Password
        </label>
        <input
          id="auth-login-password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />

        <FieldError message={error} />
        {challenge}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
        >
          {pending ? 'Lagi masuk…' : 'Masuk'}
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onUseOtp}
          className="min-h-[var(--size-touch)] text-sm font-semibold text-[var(--color-text)] underline underline-offset-4"
        >
          Masuk pakai kode email
        </button>
        <button
          type="button"
          onClick={onForgot}
          className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Lupa password?
        </button>
      </div>

      {google ? (
        <div className="mt-6">
          <p className="text-center text-sm text-[var(--color-muted)]">atau</p>
          <div className="mt-3">{google}</div>
        </div>
      ) : null}
    </section>
  );
}

export interface PasswordCreateStepProps {
  onSubmit: (password: string) => void;
  /** Existing accounts prompted mid-login may defer; new registrations may not. */
  allowSkip: boolean;
  onSkip?: () => void;
  pending: boolean;
  error: string | null;
}

/** Minimum the API accepts (auth.dto.ts). Mirrored so the button can disable early. */
export const PASSWORD_MIN_LENGTH = 8;

export function PasswordCreateStep({
  onSubmit,
  allowSkip,
  onSkip,
  pending,
  error,
}: PasswordCreateStepProps) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const tooShort = password.length < PASSWORD_MIN_LENGTH;

  return (
    <section aria-labelledby="auth-create-password-heading">
      <h1
        id="auth-create-password-heading"
        className="text-2xl font-bold text-[var(--color-text)]"
      >
        Bikin password dulu ya
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Biar masuk berikutnya nggak perlu nunggu kode email.
      </p>

      <form
        className="mt-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!pending && !tooShort) onSubmit(password);
        }}
      >
        <label
          htmlFor="auth-new-password"
          className="block text-sm font-semibold text-[var(--color-text)]"
        >
          Password baru
        </label>
        <div className="relative mt-2">
          <input
            id="auth-new-password"
            type={visible ? 'text' : 'password'}
            name="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="auth-new-password-hint"
            className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 pr-24 text-[var(--color-text)]"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-pressed={visible}
            className="absolute inset-y-0 right-2 my-auto rounded-[var(--radius-chip)] px-3 py-1 text-sm font-semibold text-[var(--color-text)]"
          >
            {visible ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
        <p id="auth-new-password-hint" className="mt-2 text-sm text-[var(--color-muted)]">
          Minimal {PASSWORD_MIN_LENGTH} karakter.
        </p>

        <FieldError message={error} />

        <button
          type="submit"
          disabled={pending || tooShort}
          className="mt-4 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
        >
          {pending ? 'Lagi disimpan…' : 'Simpan Password'}
        </button>
      </form>

      {allowSkip && onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 min-h-[var(--size-touch)] w-full text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Nanti aja
        </button>
      ) : null}
    </section>
  );
}

export interface EmailStepProps {
  onSubmit: (email: string) => void;
  pending: boolean;
  error: string | null;
  /** Rendered under the form when the API demands a bot check. */
  challenge?: React.ReactNode;
  google?: React.ReactNode;
}

export function EmailStep({ onSubmit, pending, error, challenge, google }: EmailStepProps) {
  const [email, setEmail] = useState('');

  return (
    <section aria-labelledby="auth-email-heading">
      <h1 id="auth-email-heading" className="text-2xl font-bold text-[var(--color-text)]">
        Masuk atau bikin akun
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Kami kirim kode 6 digit ke emailmu.
      </p>

      <form
        className="mt-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!pending) onSubmit(email.trim());
        }}
      >
        <label htmlFor="auth-email" className="block text-sm font-semibold text-[var(--color-text)]">
          Email
        </label>
        <input
          id="auth-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="auth-email-reassurance"
          className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />
        <p id="auth-email-reassurance" className="mt-2 text-sm text-[var(--color-muted)]">
          {REASSURANCE}
        </p>

        <FieldError message={error} />
        {challenge}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
        >
          {pending ? 'Lagi dikirim…' : 'Kirim Kode'}
        </button>
      </form>

      {google ? (
        <div className="mt-6">
          <p className="text-center text-sm text-[var(--color-muted)]">atau</p>
          <div className="mt-3">{google}</div>
        </div>
      ) : null}
    </section>
  );
}

export interface OtpStepProps {
  email: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
  pending: boolean;
  error: string | null;
  /** Restarts the countdown; bump it after every successful send. */
  sentAt: number;
}

export function OtpStep({
  email,
  onVerify,
  onResend,
  onBack,
  pending,
  error,
  sentAt,
}: OtpStepProps) {
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    const timer = setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  return (
    <section aria-labelledby="auth-otp-heading">
      <h1 id="auth-otp-heading" className="text-2xl font-bold text-[var(--color-text)]">
        Masukin kodenya
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Kode 6 digit sudah kami kirim ke {email}. Cek folder spam juga ya.
      </p>

      <form
        className="mt-6"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (!pending) onVerify(code.trim());
        }}
      >
        <label htmlFor="auth-otp" className="block text-sm font-semibold text-[var(--color-text)]">
          Kode 6 digit
        </label>
        {/*
         * One field, not six boxes. Six boxes look tidy and are hostile to
         * paste, to autofill, and to a screen reader that announces six
         * unlabelled inputs; `one-time-code` lets the OS offer the code.
         */}
        <input
          id="auth-otp"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-center text-xl tracking-[0.4em] text-[var(--color-text)]"
        />

        <FieldError message={error} />

        <button
          type="submit"
          disabled={pending}
          className="mt-4 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
        >
          {pending ? 'Lagi dicek…' : 'Lanjut'}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onResend}
          disabled={secondsLeft > 0 || pending}
          className="min-h-[var(--size-touch)] text-sm font-semibold text-[var(--color-text)] underline underline-offset-4 disabled:no-underline disabled:opacity-70"
        >
          {secondsLeft > 0 ? `Kirim ulang kode dalam ${secondsLeft} detik` : 'Kirim ulang kode'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Ganti email
        </button>
      </div>
    </section>
  );
}

export interface AgeGateProps {
  onConfirm: () => void;
  onReject: () => void;
  pending: boolean;
  error: string | null;
}

export function AgeGate({ onConfirm, onReject, pending, error }: AgeGateProps) {
  const [checked, setChecked] = useState(false);

  const confirm = useCallback(() => {
    if (checked && !pending) onConfirm();
  }, [checked, pending, onConfirm]);

  return (
    <section aria-labelledby="auth-age-heading">
      <h1 id="auth-age-heading" className="text-2xl font-bold text-[var(--color-text)]">
        Sebelum lanjut
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
        CURHAT DONG ditujukan untuk 18 tahun ke atas. Bukan karena ceritamu nggak penting kalau
        kamu lebih muda — tapi karena di sini orang bercerita soal hal-hal berat, dan kami belum
        bisa mendampingi anak di bawah umur dengan layak.
      </p>

      <label className="mt-6 flex min-h-[var(--size-touch)] items-start gap-3 text-sm text-[var(--color-text)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 size-5"
        />
        <span>Iya, umurku 18 tahun ke atas.</span>
      </label>

      <FieldError message={error} />

      <button
        type="button"
        onClick={confirm}
        disabled={!checked || pending}
        className="mt-4 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
      >
        Lanjut
      </button>

      <button
        type="button"
        onClick={onReject}
        className="mt-3 min-h-[var(--size-touch)] w-full text-sm text-[var(--color-muted)] underline underline-offset-4"
      >
        Umurku belum 18
      </button>
    </section>
  );
}

/**
 * The under-18 screen.
 *
 * Nothing here scolds. Someone who answered honestly has done the right thing,
 * and the last thing they should read is a sentence implying they tried to
 * cheat. It also does not say "come back tomorrow" — the cooldown is an
 * anti-retry measure, not an invitation to lie later.
 */
export function AgeBlocked({ onHome }: { onHome: () => void }) {
  return (
    <section aria-labelledby="auth-blocked-heading">
      <h1 id="auth-blocked-heading" className="text-2xl font-bold text-[var(--color-text)]">
        Makasih udah jujur 🤍
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-text)]">
        CURHAT DONG memang dibatasi untuk 18 tahun ke atas, jadi kami belum bisa nemenin kamu di
        sini sekarang.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
        Bukan berarti yang kamu rasain nggak penting. Kalau lagi berat, cerita ke orang dewasa yang
        kamu percaya — guru BK, keluarga, atau layanan konseling remaja di sekitarmu.
      </p>

      <button
        type="button"
        onClick={onHome}
        className="mt-6 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] border border-[var(--color-brand)] px-6 font-semibold text-[var(--color-text)]"
      >
        Kembali ke halaman depan
      </button>
    </section>
  );
}
