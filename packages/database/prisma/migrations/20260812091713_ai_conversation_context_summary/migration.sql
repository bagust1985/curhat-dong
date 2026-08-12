-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "context_summary" TEXT,
ADD COLUMN     "summarized_through_id" UUID;
