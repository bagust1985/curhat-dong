/**
 * Transactional email — TECH-SPEC §5.2.
 *
 * The auth domain depends on this interface, never on Resend directly, so
 * moving to Postmark or SES is a change in one adapter file.
 */

export interface SendOtpInput {
  to: string;
  code: string;
  /** Minutes until the code stops working. */
  expiresInMinutes: number;
}

export interface TransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  sendOtp(input: SendOtpInput): Promise<void>;
  sendTransactional(input: TransactionalEmailInput): Promise<void>;
}

/**
 * OTP email copy.
 *
 * Carries the code, how long it lasts, and what to do if it was not requested
 * — and nothing else. No alias, no activity, no account details: an inbox is
 * not always private, and this product's users have particular reason to care
 * who else can read their mail.
 */
export function renderOtpEmail(input: SendOtpInput): TransactionalEmailInput {
  const text = [
    'Halo,',
    '',
    `Kode masuk kamu: ${input.code}`,
    '',
    `Kode ini berlaku ${input.expiresInMinutes} menit.`,
    'Kalau bukan kamu yang minta, abaikan aja email ini — nggak ada yang berubah.',
    '',
    'CURHAT DONG',
  ].join('\n');

  const html = `<!doctype html>
<html lang="id">
  <body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1f2b;">
    <p>Halo,</p>
    <p>Kode masuk kamu:</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">${input.code}</p>
    <p>Kode ini berlaku ${input.expiresInMinutes} menit.</p>
    <p style="color: #5a6478;">Kalau bukan kamu yang minta, abaikan aja email ini — nggak ada yang berubah.</p>
    <p style="color: #5a6478;">CURHAT DONG</p>
  </body>
</html>`;

  return { to: input.to, subject: `Kode masuk CURHAT DONG: ${input.code}`, html, text };
}
