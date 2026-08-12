import { Resend } from 'resend';

import {
  renderOtpEmail,
  type EmailProvider,
  type SendOtpInput,
  type TransactionalEmailInput,
} from './email.js';

export class EmailDeliveryError extends Error {
  constructor(provider: string, cause: unknown) {
    // The address is deliberately absent from the message: delivery failures
    // end up in logs and error trackers, and an email address there is a PII
    // leak (PRD §20).
    super(`Email delivery failed via ${provider}`);
    this.name = 'EmailDeliveryError';
    this.cause = cause;
  }
}

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async sendOtp(input: SendOtpInput): Promise<void> {
    await this.sendTransactional(renderOtpEmail(input));
  }

  async sendTransactional(input: TransactionalEmailInput): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) throw new EmailDeliveryError('resend', error);
  }
}

/**
 * Development provider: prints the OTP to stdout instead of sending anything.
 *
 * Keeps local development off the network and out of a real inbox. Refuses to
 * run in production — a silently non-sending provider there would mean nobody
 * can log in and nothing looks broken.
 */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(nodeEnv: string) {
    if (nodeEnv === 'production') {
      throw new Error(
        'ConsoleEmailProvider must never run in production — set EMAIL_PROVIDER=resend.',
      );
    }
  }

  async sendOtp(input: SendOtpInput): Promise<void> {
    console.warn(`[email:otp] to=${input.to} code=${input.code}`);
    return Promise.resolve();
  }

  async sendTransactional(input: TransactionalEmailInput): Promise<void> {
    console.warn(`[email] to=${input.to} subject="${input.subject}"`);
    return Promise.resolve();
  }
}

export function createEmailProvider(options: {
  provider: string;
  nodeEnv: string;
  from: string;
  resendApiKey?: string | undefined;
}): EmailProvider {
  switch (options.provider) {
    case 'resend': {
      if (!options.resendApiKey) {
        throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY.');
      }
      return new ResendEmailProvider(options.resendApiKey, options.from);
    }
    case 'console':
      return new ConsoleEmailProvider(options.nodeEnv);
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER: ${options.provider}`);
  }
}
