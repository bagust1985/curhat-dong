-- E14-T14, E14-T15 — daily metric snapshots and admin broadcasts.
--
-- Reviewed by hand per CLAUDE.md rule #7. Purely additive: two new tables and
-- three new enums. Nothing existing is altered, renamed or dropped.
--
-- `analytics_daily` is keyed by date so recomputing a day overwrites it — a
-- backfill is idempotent, and a corrected metric definition can be replayed
-- over history rather than leaving two eras of incomparable numbers.

-- CreateEnum
CREATE TYPE "BroadcastType" AS ENUM ('announcement', 'maintenance', 'campaign', 'safety');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "BroadcastSegment" AS ENUM ('all', 'listeners', 'active_users', 'inactive_users');

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" UUID NOT NULL,
    "type" "BroadcastType" NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'draft',
    "segment" "BroadcastSegment" NOT NULL DEFAULT 'all',
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(240) NOT NULL,
    "estimated_recipients" INTEGER NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily" (
    "date" DATE NOT NULL,
    "new_users" INTEGER NOT NULL DEFAULT 0,
    "active_users" INTEGER NOT NULL DEFAULT 0,
    "dau" INTEGER NOT NULL DEFAULT 0,
    "wau" INTEGER NOT NULL DEFAULT 0,
    "mau" INTEGER NOT NULL DEFAULT 0,
    "posts_published" INTEGER NOT NULL DEFAULT 0,
    "comments_posted" INTEGER NOT NULL DEFAULT 0,
    "ai_conversations" INTEGER NOT NULL DEFAULT 0,
    "listener_sessions" INTEGER NOT NULL DEFAULT 0,
    "active_listeners" INTEGER NOT NULL DEFAULT 0,
    "felt_heard_answered" INTEGER NOT NULL DEFAULT 0,
    "felt_heard_positive" INTEGER NOT NULL DEFAULT 0,
    "felt_heard_dismissed" INTEGER NOT NULL DEFAULT 0,
    "activated_users" INTEGER NOT NULL DEFAULT 0,
    "posts_with_response_24h" INTEGER NOT NULL DEFAULT 0,
    "median_first_response_seconds" INTEGER,
    "reports_filed" INTEGER NOT NULL DEFAULT 0,
    "ai_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ai_call_count" INTEGER NOT NULL DEFAULT 0,
    "cases_opened" INTEGER NOT NULL DEFAULT 0,
    "cases_resolved" INTEGER NOT NULL DEFAULT 0,
    "sla_breached" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "broadcasts_status_scheduled_for_idx" ON "broadcasts"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts"("created_at" DESC);

