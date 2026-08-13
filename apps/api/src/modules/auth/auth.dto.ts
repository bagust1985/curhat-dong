import { z } from 'zod';

/** Zod at the API boundary — CLAUDE.md konvensi. */

export const otpRequestSchema = z.object({
  email: z.string().email().max(254),
  turnstileToken: z.string().max(4096).optional(),
});

export const otpVerifySchema = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/, 'Kode harus 6 digit'),
  deviceId: z.string().max(128).optional(),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1).max(8192),
  deviceId: z.string().max(128).optional(),
});

export const passwordLoginSchema = z.object({
  email: z.string().email().max(254),
  // min(1), not min(8): the *login* schema must not disclose the policy of a
  // password that might not exist — a short guess earns the same generic
  // AUTH_CREDENTIALS_INVALID as any other wrong password.
  password: z.string().min(1).max(128),
  deviceId: z.string().max(128).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password minimal 8 karakter ya.').max(128),
  currentPassword: z.string().max(128).optional(),
});

export const refreshSchema = z.object({
  /** Omitted by web clients — the token travels in an HttpOnly cookie. */
  refreshToken: z.string().min(1).max(512).optional(),
});

export const updateProfileSchema = z
  .object({
    alias: z
      .string()
      .min(3)
      .max(24)
      .regex(/^[A-Za-z0-9_ ]+$/, 'Alias hanya boleh huruf, angka, spasi, dan garis bawah')
      .optional(),
    avatar: z.string().max(64).optional(),
    bio: z.string().max(280).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada yang diubah',
  });

export type OtpRequestDto = z.infer<typeof otpRequestSchema>;
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;
export type PasswordLoginDto = z.infer<typeof passwordLoginSchema>;
export type SetPasswordDto = z.infer<typeof setPasswordSchema>;
export type GoogleAuthDto = z.infer<typeof googleAuthSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
