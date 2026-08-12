-- E12 — notification delivery state and device dedup.
--
-- Reviewed by hand per CLAUDE.md rule #7. No DROP, no column rename, no type
-- narrowing: every statement below only adds.
--
-- `user_devices.push_token_hash` is added NOT NULL without a default. That is
-- safe here and only here: E12 is the first epic that writes to this table, so
-- no environment has ever held a row (verified: 0 rows). The value cannot be
-- backfilled anyway — it is a keyed hash of a token whose ciphertext is not
-- reversible without the encryption key, and the point of the column is that
-- the ciphertext cannot be compared (AES-GCM randomises the IV).

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('pending', 'held', 'sent', 'skipped', 'dropped', 'failed');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "deliver_after" TIMESTAMPTZ(6),
ADD COLUMN     "push_status" "PushStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "pushed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "user_devices" ADD COLUMN     "disabled_at" TIMESTAMPTZ(6),
ADD COLUMN     "disabled_reason" TEXT,
ADD COLUMN     "push_token_hash" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "notifications_push_status_deliver_after_idx" ON "notifications"("push_status", "deliver_after");

-- CreateIndex
-- Idempotency (E12-T06). Postgres treats NULLs as distinct, so broadcasts with
-- no natural event identity are unaffected by this constraint.
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
-- Unique across all users: one device holds one push token, and after a
-- re-login it must stop receiving the previous account's notifications.
CREATE UNIQUE INDEX "user_devices_push_token_hash_key" ON "user_devices"("push_token_hash");

-- CreateIndex
CREATE INDEX "user_devices_user_id_disabled_at_idx" ON "user_devices"("user_id", "disabled_at");
