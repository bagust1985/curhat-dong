-- E14-T01 — admin MFA (TOTP) and per-session step-up state.
--
-- Reviewed by hand per CLAUDE.md rule #7. Additive only: three nullable columns
-- on `users` and one on `user_sessions`. No DROP, no rename, no type change.
--
-- MFA state lives on `users` rather than in a separate table because it is
-- one-to-one with an account and is read on every admin login; a join there
-- would buy nothing. `mfa_verified_at` is per *session* on purpose — an admin
-- logged in on two machines has proved possession of the second factor on one
-- of them, not both.

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "mfa_verified_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_enabled_at" TIMESTAMPTZ(6),
ADD COLUMN     "mfa_last_step" INTEGER,
ADD COLUMN     "mfa_secret_encrypted" TEXT;
