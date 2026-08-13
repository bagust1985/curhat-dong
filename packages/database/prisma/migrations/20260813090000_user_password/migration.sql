-- Revisi 1 (13 Aug 2026) — password auth alongside email OTP.
--
-- Reviewed by hand per CLAUDE.md rule #7. Additive only: two nullable columns
-- on `users`. No DROP, no rename, no type change, no enum change.
--
-- Nullable is not just the destructive-migration gate talking: every account
-- that exists tonight genuinely has no password until its next OTP login, and
-- Google-only accounts may never set one. The hash lives on `users`, not
-- `auth_accounts` — a password belongs to the account, not to a provider link,
-- and a Google-only user setting one must not need a fake email_otp row.
--
-- The hash format (`scrypt-v1$...`) is self-describing so KDF parameters can
-- be raised later without another migration: packages/auth/src/password.ts.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT,
ADD COLUMN "password_set_at" TIMESTAMPTZ(6);
