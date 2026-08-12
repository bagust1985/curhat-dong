-- AI Gateway: prompt versioning + routing observability (E08-T03, E08-T04).
--
-- Reviewed by hand as CLAUDE.md rule #7 requires. The generated diff also
-- proposed `ALTER TABLE "curhat_posts" DROP COLUMN "search_vector"` — that
-- column is the hand-written generated tsvector from the E02-T08 migration,
-- which Prisma cannot express and therefore reads as drift. Dropping it would
-- silently take search offline. The drop is removed here and `CurhatPost` now
-- declares the column as `Unsupported("tsvector")` so the diff stops
-- proposing it.

-- AlterTable
ALTER TABLE "ai_usage_events" ADD COLUMN     "routing_tier" TEXT;

-- CreateTable
CREATE TABLE "ai_prompts" (
    "key" TEXT NOT NULL,
    "active_version" INTEGER NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_prompt_versions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "change_note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_prompt_versions_key_created_at_idx" ON "ai_prompt_versions"("key", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_versions_key_version_key" ON "ai_prompt_versions"("key", "version");

-- AddForeignKey
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_key_fkey" FOREIGN KEY ("key") REFERENCES "ai_prompts"("key") ON DELETE CASCADE ON UPDATE CASCADE;
