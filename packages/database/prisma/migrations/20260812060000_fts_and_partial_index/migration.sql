-- Full-text search + partial index for the feed (E02-T08, TECH-SPEC §2.4).
--
-- Written by hand: Prisma cannot express a tsvector column, a GIN index, or a
-- partial index in schema.prisma.

-- ---------------------------------------------------------------------------
-- Full-text search over curhat posts
-- ---------------------------------------------------------------------------

-- 'simple' rather than 'indonesian': PostgreSQL ships no Indonesian stemmer,
-- and 'english' would stem Indonesian words wrongly ("marah" -> "marah" is
-- fine, but "sedihnya" would not match "sedih" either way). 'simple' keeps
-- tokens intact; prefix matching in the query layer handles affixes for MVP.
-- Revisit if search quality proves insufficient — a proper Indonesian
-- dictionary is a bigger change than Phase 1 warrants.
ALTER TABLE "curhat_posts"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("body", '')), 'B')
  ) STORED;

-- Partial: only published posts are searchable. Held and removed content must
-- never surface through search (E13-T01).
CREATE INDEX "curhat_posts_search_idx"
  ON "curhat_posts" USING GIN ("search_vector")
  WHERE "status" = 'published';

-- ---------------------------------------------------------------------------
-- Partial indexes for the feed (TECH-SPEC §2.4)
-- ---------------------------------------------------------------------------

-- The main feed only ever reads published posts, so the index should not carry
-- the pending_analysis / held / removed rows.
CREATE INDEX "curhat_posts_published_created_idx"
  ON "curhat_posts" ("created_at" DESC)
  WHERE "status" = 'published';

CREATE INDEX "curhat_posts_published_category_idx"
  ON "curhat_posts" ("category_id", "created_at" DESC)
  WHERE "status" = 'published';

-- "Butuh Didengar": response_count < 2 AND younger than 48h (TECH-SPEC §4.7).
-- The age half of the predicate cannot be indexed (now() is not immutable), so
-- the index covers the response_count half and ordering.
CREATE INDEX "curhat_posts_butuh_didengar_idx"
  ON "curhat_posts" ("created_at" DESC)
  WHERE "status" = 'published' AND "response_count" < 2;

-- ---------------------------------------------------------------------------
-- Operational partial indexes
-- ---------------------------------------------------------------------------

-- SLA watchdog scans only unresolved cases (TECH-SPEC §18.7).
CREATE INDEX "moderation_cases_open_sla_idx"
  ON "moderation_cases" ("sla_due_at")
  WHERE "status" IN ('open', 'in_review');

-- Match offer expiry sweep touches only live offers.
CREATE INDEX "listener_matches_open_offers_idx"
  ON "listener_matches" ("expires_at")
  WHERE "status" = 'offered';

-- Unread notification badge.
CREATE INDEX "notifications_unread_idx"
  ON "notifications" ("user_id", "created_at" DESC)
  WHERE "read_at" IS NULL;

-- Candidate set for matching (TECH-SPEC §4.5).
CREATE INDEX "listener_availability_available_idx"
  ON "listener_availability" ("user_id")
  WHERE "is_available" = true;
