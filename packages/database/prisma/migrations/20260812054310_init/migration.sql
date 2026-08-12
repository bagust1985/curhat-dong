-- CreateEnum
CREATE TYPE "AiPersonality" AS ENUM ('pendengar', 'pemikir', 'teman_hangat', 'teman_santai', 'journal_companion');

-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('anthropic', 'openai', 'local');

-- CreateEnum
CREATE TYPE "ClassificationTarget" AS ENUM ('post', 'comment', 'message', 'ai_message');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('tos_privacy', 'sensitive_processing', 'analytics');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('onboarding', 'settings', 'reconsent');

-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('phone', 'chat', 'whatsapp', 'web');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('pending', 'processing', 'ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('social', 'response', 'listener', 'ai', 'safety', 'account');

-- CreateEnum
CREATE TYPE "RetentionRunStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('draft', 'pending_analysis', 'published', 'held', 'removed', 'deleted');

-- CreateEnum
CREATE TYPE "SafetyLevel" AS ENUM ('L0', 'L1', 'L2', 'L3', 'pending');

-- CreateEnum
CREATE TYPE "AnonymityMode" AS ENUM ('alias', 'anonymous');

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('sedih', 'marah', 'cemas', 'capek', 'patah_hati', 'kosong', 'overthinking', 'lega', 'senang', 'bersyukur', 'bingung');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('cuma_didengar', 'butuh_saran', 'butuh_dukungan', 'pernah_ngalamin');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('aku_ngerti', 'peluk_virtual', 'aku_dengerin', 'aku_pernah_di_situ', 'tetap_kuat', 'cerita_lagi');

-- CreateEnum
CREATE TYPE "ReactionTarget" AS ENUM ('post', 'comment');

-- CreateEnum
CREATE TYPE "FeltHeardAnswer" AS ENUM ('yes', 'somewhat', 'no');

-- CreateEnum
CREATE TYPE "FeltHeardTarget" AS ENUM ('post', 'session');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('published', 'held', 'removed', 'deleted');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'muted', 'suspended', 'banned', 'deleted');

-- CreateEnum
CREATE TYPE "DeletionMode" AS ENUM ('purge', 'anonymize');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('email_otp', 'google');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('web', 'android', 'ios');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('expo', 'fcm', 'webpush');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('login', 'email_change');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'moderator', 'customer_support', 'content_manager', 'finance');

-- CreateEnum
CREATE TYPE "ListenerSafetyStatus" AS ENUM ('ok', 'under_review', 'suspended');

-- CreateEnum
CREATE TYPE "ListenerRequestStatus" AS ENUM ('searching', 'matched', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('offered', 'accepted', 'declined', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('listener_session');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "RoomRole" AS ENUM ('requester', 'listener');

-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('requester_ended', 'listener_ended', 'idle_timeout', 'moderation', 'blocked');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('bullying', 'harassment', 'sexual', 'hate', 'threat', 'scam', 'doxxing', 'spam', 'dangerous_content', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'triaged', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "ModerationQueue" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('open', 'in_review', 'resolved', 'escalated');

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('ai', 'report', 'system', 'listener_escalate');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('approve', 'remove', 'warn', 'mute', 'suspend', 'ban', 'escalate');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'under_review', 'upheld', 'overturned', 'reduced');

-- CreateEnum
CREATE TYPE "SafetyTarget" AS ENUM ('post', 'comment', 'message', 'ai_message', 'user');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "personality_mode" "AiPersonality" NOT NULL DEFAULT 'pendengar',
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "AiRole" NOT NULL,
    "body" TEXT NOT NULL,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "model" TEXT,
    "provider" "AiProvider",
    "safety_level" "SafetyLevel" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_classifications" (
    "id" UUID NOT NULL,
    "target_type" "ClassificationTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "emotion" TEXT,
    "topic" TEXT,
    "intent" TEXT,
    "urgency" TEXT,
    "risk_scores" JSONB NOT NULL DEFAULT '{}',
    "safety_level" "SafetyLevel" NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "operation" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "cost_estimate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "prompt_version" TEXT,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "document_version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "method" "ConsentMethod" NOT NULL DEFAULT 'onboarding',
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_resources" (
    "id" UUID NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'ID',
    "name" TEXT NOT NULL,
    "channel" "SupportChannel" NOT NULL,
    "value" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'id',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "source_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'pending',
    "file_key" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_runs" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "deleted_count" INTEGER NOT NULL DEFAULT 0,
    "status" "RetentionRunStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "retention_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "user_id" UUID NOT NULL,
    "per_type_toggles" JSONB NOT NULL DEFAULT '{}',
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT true,
    "felt_heard_prompt_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "app_configs" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "post_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "post_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curhat_posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(160),
    "body" TEXT NOT NULL,
    "mood" "Mood" NOT NULL,
    "intent" "Intent" NOT NULL,
    "anonymity_mode" "AnonymityMode" NOT NULL DEFAULT 'alias',
    "allow_comments" BOOLEAN NOT NULL DEFAULT true,
    "request_listener" BOOLEAN NOT NULL DEFAULT false,
    "status" "PostStatus" NOT NULL DEFAULT 'pending_analysis',
    "safety_level" "SafetyLevel" NOT NULL DEFAULT 'pending',
    "needs_reanalysis" BOOLEAN NOT NULL DEFAULT false,
    "response_count" INTEGER NOT NULL DEFAULT 0,
    "noindex" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "curhat_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'published',
    "safety_level" "SafetyLevel" NOT NULL DEFAULT 'pending',
    "is_marked_helpful" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "target_type" "ReactionTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ReactionType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "felt_heard_prompts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" "FeltHeardTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "shown_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),
    "answer" "FeltHeardAnswer",
    "dismissed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "felt_heard_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "felt_heard_feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID,
    "session_id" UUID,
    "answer" "FeltHeardAnswer" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "felt_heard_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mood" "Mood" NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "trust_score_internal" INTEGER NOT NULL DEFAULT 50,
    "age_declared_at" TIMESTAMPTZ(6),
    "admin_role" "AdminRole",
    "deleted_at" TIMESTAMPTZ(6),
    "deletion_mode" "DeletionMode",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_id" TEXT,
    "email_hash" TEXT NOT NULL,
    "email_encrypted" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "email_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'login',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_lower" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" VARCHAR(280),
    "is_listener" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "onboarding_reason" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "anonymous_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "display_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "push_provider" "PushProvider" NOT NULL,
    "push_token_encrypted" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "quiet_hours_start" INTEGER DEFAULT 22,
    "quiet_hours_end" INTEGER DEFAULT 7,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "device_id" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_users" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "trust_scores" (
    "user_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 50,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_scores_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "listener_profiles" (
    "user_id" UUID NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY['id']::TEXT[],
    "max_concurrent" INTEGER NOT NULL DEFAULT 3,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "helpful_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "felt_heard_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safety_status" "ListenerSafetyStatus" NOT NULL DEFAULT 'ok',
    "guidelines_version_accepted" TEXT,
    "guidelines_accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listener_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "listener_availability" (
    "user_id" UUID NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listener_availability_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "listener_session_counters" (
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "last_session_ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "listener_session_counters_pkey" PRIMARY KEY ("user_id","date")
);

-- CreateTable
CREATE TABLE "listener_requests" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "emotion" TEXT NOT NULL,
    "post_id" UUID,
    "status" "ListenerRequestStatus" NOT NULL DEFAULT 'searching',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "listener_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listener_matches" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "listener_id" UUID NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'offered',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listener_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listener_sessions" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "listener_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" "SessionEndReason",
    "listener_felt_safe" BOOLEAN,
    "listener_note" TEXT,

    CONSTRAINT "listener_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" UUID NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'listener_session',
    "status" "RoomStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_members" (
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "RoomRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_members_pkey" PRIMARY KEY ("room_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "safety_level" "SafetyLevel" NOT NULL DEFAULT 'pending',
    "needs_reanalysis" BOOLEAN NOT NULL DEFAULT false,
    "client_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "target_type" "SafetyTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "level" "SafetyLevel" NOT NULL,
    "action_taken" TEXT NOT NULL,
    "resource_shown" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "SafetyTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "note" TEXT,
    "priority" "ModerationQueue" NOT NULL DEFAULT 'medium',
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "case_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" UUID NOT NULL,
    "source" "CaseSource" NOT NULL,
    "queue" "ModerationQueue" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'open',
    "target_type" "SafetyTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "assigned_to" UUID,
    "sla_due_at" TIMESTAMPTZ(6) NOT NULL,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "duration_hours" INTEGER,
    "is_appealable" BOOLEAN NOT NULL DEFAULT true,
    "appealed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_appeals" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "decider_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "diff" JSONB,
    "ip_hash" TEXT,
    "case_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_messages_created_at_idx" ON "ai_messages"("created_at");

-- CreateIndex
CREATE INDEX "ai_classifications_target_type_target_id_idx" ON "ai_classifications"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ai_classifications_safety_level_created_at_idx" ON "ai_classifications"("safety_level", "created_at");

-- CreateIndex
CREATE INDEX "ai_classifications_created_at_idx" ON "ai_classifications"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_created_at_idx" ON "ai_usage_events"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_user_id_created_at_idx" ON "ai_usage_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_operation_created_at_idx" ON "ai_usage_events"("operation", "created_at");

-- CreateIndex
CREATE INDEX "consent_records_user_id_consent_type_idx" ON "consent_records"("user_id", "consent_type");

-- CreateIndex
CREATE UNIQUE INDEX "consent_records_user_id_consent_type_document_version_key" ON "consent_records"("user_id", "consent_type", "document_version");

-- CreateIndex
CREATE INDEX "support_resources_region_is_active_verified_at_idx" ON "support_resources"("region", "is_active", "verified_at");

-- CreateIndex
CREATE INDEX "data_export_requests_user_id_requested_at_idx" ON "data_export_requests"("user_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "retention_runs_job_name_started_at_idx" ON "retention_runs"("job_name", "started_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_slug_key" ON "post_categories"("slug");

-- CreateIndex
CREATE INDEX "post_categories_is_active_display_order_idx" ON "post_categories"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "curhat_posts_status_created_at_idx" ON "curhat_posts"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "curhat_posts_category_id_created_at_idx" ON "curhat_posts"("category_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "curhat_posts_response_count_created_at_idx" ON "curhat_posts"("response_count", "created_at" DESC);

-- CreateIndex
CREATE INDEX "curhat_posts_author_id_created_at_idx" ON "curhat_posts"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "curhat_posts_needs_reanalysis_idx" ON "curhat_posts"("needs_reanalysis");

-- CreateIndex
CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

-- CreateIndex
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");

-- CreateIndex
CREATE INDEX "reactions_target_type_target_id_idx" ON "reactions"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_target_type_target_id_user_id_type_key" ON "reactions"("target_type", "target_id", "user_id", "type");

-- CreateIndex
CREATE INDEX "felt_heard_prompts_user_id_shown_at_idx" ON "felt_heard_prompts"("user_id", "shown_at");

-- CreateIndex
CREATE UNIQUE INDEX "felt_heard_prompts_user_id_target_type_target_id_key" ON "felt_heard_prompts"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "felt_heard_feedback_created_at_idx" ON "felt_heard_feedback"("created_at");

-- CreateIndex
CREATE INDEX "felt_heard_feedback_post_id_idx" ON "felt_heard_feedback"("post_id");

-- CreateIndex
CREATE INDEX "felt_heard_feedback_session_id_idx" ON "felt_heard_feedback"("session_id");

-- CreateIndex
CREATE INDEX "mood_entries_user_id_created_at_idx" ON "mood_entries"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE INDEX "auth_accounts_email_hash_idx" ON "auth_accounts"("email_hash");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_provider_id_key" ON "auth_accounts"("provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_email_hash_key" ON "auth_accounts"("provider", "email_hash");

-- CreateIndex
CREATE INDEX "otp_challenges_email_hash_created_at_idx" ON "otp_challenges"("email_hash", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenges_expires_at_idx" ON "otp_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_alias_key" ON "user_profiles"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_alias_lower_key" ON "user_profiles"("alias_lower");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_identities_post_id_key" ON "anonymous_identities"("post_id");

-- CreateIndex
CREATE INDEX "anonymous_identities_user_id_idx" ON "anonymous_identities"("user_id");

-- CreateIndex
CREATE INDEX "user_devices_user_id_last_seen_idx" ON "user_devices"("user_id", "last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_user_id_device_id_key" ON "user_devices"("user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_family_id_idx" ON "user_sessions"("family_id");

-- CreateIndex
CREATE INDEX "blocked_users_blocked_id_idx" ON "blocked_users"("blocked_id");

-- CreateIndex
CREATE INDEX "listener_profiles_safety_status_idx" ON "listener_profiles"("safety_status");

-- CreateIndex
CREATE INDEX "listener_availability_is_available_idx" ON "listener_availability"("is_available");

-- CreateIndex
CREATE INDEX "listener_requests_requester_id_status_idx" ON "listener_requests"("requester_id", "status");

-- CreateIndex
CREATE INDEX "listener_requests_status_created_at_idx" ON "listener_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "listener_matches_request_id_status_idx" ON "listener_matches"("request_id", "status");

-- CreateIndex
CREATE INDEX "listener_matches_listener_id_status_idx" ON "listener_matches"("listener_id", "status");

-- CreateIndex
CREATE INDEX "listener_matches_expires_at_idx" ON "listener_matches"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "listener_sessions_match_id_key" ON "listener_sessions"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "listener_sessions_room_id_key" ON "listener_sessions"("room_id");

-- CreateIndex
CREATE INDEX "listener_sessions_listener_id_ended_at_idx" ON "listener_sessions"("listener_id", "ended_at");

-- CreateIndex
CREATE INDEX "listener_sessions_requester_id_ended_at_idx" ON "listener_sessions"("requester_id", "ended_at");

-- CreateIndex
CREATE INDEX "chat_rooms_status_created_at_idx" ON "chat_rooms"("status", "created_at");

-- CreateIndex
CREATE INDEX "room_members_user_id_left_at_idx" ON "room_members"("user_id", "left_at");

-- CreateIndex
CREATE INDEX "messages_room_id_created_at_idx" ON "messages"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_room_id_client_message_id_key" ON "messages"("room_id", "client_message_id");

-- CreateIndex
CREATE INDEX "safety_events_target_type_target_id_idx" ON "safety_events"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "safety_events_level_created_at_idx" ON "safety_events"("level", "created_at");

-- CreateIndex
CREATE INDEX "safety_events_created_at_idx" ON "safety_events"("created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_priority_created_at_idx" ON "reports"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "moderation_cases_queue_status_created_at_idx" ON "moderation_cases"("queue", "status", "created_at");

-- CreateIndex
CREATE INDEX "moderation_cases_status_sla_due_at_idx" ON "moderation_cases"("status", "sla_due_at");

-- CreateIndex
CREATE INDEX "moderation_cases_target_type_target_id_idx" ON "moderation_cases"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "moderation_actions_case_id_idx" ON "moderation_actions"("case_id");

-- CreateIndex
CREATE INDEX "moderation_actions_target_user_id_created_at_idx" ON "moderation_actions"("target_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_actions_moderator_id_idx" ON "moderation_actions"("moderator_id");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_appeals_action_id_key" ON "moderation_appeals"("action_id");

-- CreateIndex
CREATE INDEX "moderation_appeals_status_created_at_idx" ON "moderation_appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "moderation_appeals_user_id_created_at_idx" ON "moderation_appeals"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curhat_posts" ADD CONSTRAINT "curhat_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curhat_posts" ADD CONSTRAINT "curhat_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "post_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "curhat_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "felt_heard_prompts" ADD CONSTRAINT "felt_heard_prompts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "felt_heard_feedback" ADD CONSTRAINT "felt_heard_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "felt_heard_feedback" ADD CONSTRAINT "felt_heard_feedback_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "curhat_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "felt_heard_feedback" ADD CONSTRAINT "felt_heard_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "listener_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_identities" ADD CONSTRAINT "anonymous_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_identities" ADD CONSTRAINT "anonymous_identities_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "curhat_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_profiles" ADD CONSTRAINT "listener_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_availability" ADD CONSTRAINT "listener_availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_session_counters" ADD CONSTRAINT "listener_session_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_requests" ADD CONSTRAINT "listener_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_requests" ADD CONSTRAINT "listener_requests_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "curhat_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_matches" ADD CONSTRAINT "listener_matches_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "listener_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_matches" ADD CONSTRAINT "listener_matches_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_matches" ADD CONSTRAINT "listener_matches_listener_id_fkey" FOREIGN KEY ("listener_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_sessions" ADD CONSTRAINT "listener_sessions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "listener_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_sessions" ADD CONSTRAINT "listener_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_sessions" ADD CONSTRAINT "listener_sessions_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listener_sessions" ADD CONSTRAINT "listener_sessions_listener_id_fkey" FOREIGN KEY ("listener_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "moderation_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma cannot express in schema.prisma.
-- Added by hand and committed with the migration (E02-T06).
-- ---------------------------------------------------------------------------

-- PRD §15.4 / TECH-SPEC §19.2: an appeal must not be reviewed by the moderator
-- who took the action. Enforced here as well as in the service layer, because
-- this is a fairness guarantee and not a UI convention.
ALTER TABLE "moderation_appeals"
  ADD CONSTRAINT "moderation_appeals_reviewer_not_decider"
  CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "decider_id");

-- PRD §9: comment replies nest exactly one level. A reply may not have a
-- parent that is itself a reply. Enforced with a trigger since a CHECK cannot
-- read another row.
CREATE OR REPLACE FUNCTION enforce_comment_single_nesting()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM "comments"
      WHERE "id" = NEW.parent_id AND "parent_id" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'comments may nest one level only (COMMENT_NESTING_TOO_DEEP)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comments_single_nesting
  BEFORE INSERT OR UPDATE ON "comments"
  FOR EACH ROW EXECUTE FUNCTION enforce_comment_single_nesting();

-- A user cannot block themselves.
ALTER TABLE "blocked_users"
  ADD CONSTRAINT "blocked_users_no_self_block"
  CHECK ("blocker_id" <> "blocked_id");

-- A listener cannot be matched with themselves (TECH-SPEC §4.5 filter).
ALTER TABLE "listener_matches"
  ADD CONSTRAINT "listener_matches_no_self_match"
  CHECK ("requester_id" <> "listener_id");

-- PRD §11.2: max_concurrent may be lowered by the listener but never raised
-- above the platform default of 3.
ALTER TABLE "listener_profiles"
  ADD CONSTRAINT "listener_profiles_max_concurrent_range"
  CHECK ("max_concurrent" BETWEEN 1 AND 3);

-- PRD §15.2: a support resource must never go live without an official source
-- and a verification date. A wrong hotline is more dangerous than none.
ALTER TABLE "support_resources"
  ADD CONSTRAINT "support_resources_verified_when_active"
  CHECK ("is_active" = false OR (length(trim("source_url")) > 0));

-- PRD §9: a Felt Heard prompt is either answered or dismissed, never both.
-- Conflating the two would let a dismissal be counted as "no" and poison the
-- North Star metric.
ALTER TABLE "felt_heard_prompts"
  ADD CONSTRAINT "felt_heard_prompts_answer_xor_dismiss"
  CHECK (NOT ("dismissed" = true AND "answer" IS NOT NULL));
