// The guard itself is a plain `.mjs` so the deploy pipeline can run it with
// bare `node`, before anything is installed or built on the server. Its tests
// live here because migrations are this package's responsibility and this is
// where a vitest runner already exists.
// @ts-expect-error — untyped ESM script, imported deliberately.
import { inspectSql } from '../../../infrastructure/scripts/check-destructive-migration.mjs';

import { describe, expect, it } from 'vitest';

type Inspection = { findings: string[]; approved: boolean; reason: string };
const inspect = inspectSql as (sql: string) => Inspection;

/**
 * Destructive-migration gate — E17-T04. CLAUDE.md non-negotiable #7.
 *
 * The rule already exists on paper. What is tested here is that the pipeline
 * actually reads the SQL, because the way this rule fails is a DROP COLUMN
 * riding along inside a twelve-file migration nobody read closely at 23:00.
 */
describe('what must stop a deploy', () => {
  const cases: Record<string, string> = {
    drop_table: 'DROP TABLE user_devices;',
    drop_column: 'ALTER TABLE posts DROP COLUMN body;',
    truncate: 'TRUNCATE room_messages;',
    set_not_null: 'ALTER TABLE posts ALTER COLUMN category_id SET NOT NULL;',
    rename_column: 'ALTER TABLE posts RENAME COLUMN body TO content;',
    drop_constraint: 'ALTER TABLE appeals DROP CONSTRAINT appeals_reviewer_check;',
  };

  for (const [id, sql] of Object.entries(cases)) {
    it(`catches ${id}`, () => {
      const result = inspect(sql);
      expect(result.findings).toContain(id);
      expect(result.approved).toBe(false);
    });
  }

  it('catches a narrowing type change, which truncates silently', () => {
    // Worse than a drop: a drop is obvious afterwards.
    expect(inspect('ALTER TABLE posts ALTER COLUMN title TYPE varchar(10);').findings).toContain(
      'alter_column_type',
    );
  });
});

describe('what must not stop a deploy', () => {
  const safe = [
    'CREATE TABLE retention_runs (id uuid PRIMARY KEY);',
    'ALTER TABLE posts ADD COLUMN needs_reanalysis boolean DEFAULT false;',
    'CREATE INDEX CONCURRENTLY posts_created_idx ON posts (created_at DESC);',
    "UPDATE app_config SET value = '30' WHERE key = 'retention.days.post_grace_after_delete';",
    "DELETE FROM otp_challenges WHERE created_at < now() - interval '1 day';",
  ];

  for (const sql of safe) {
    it(`allows: ${sql.slice(0, 44)}…`, () => {
      expect(inspect(sql).findings).toEqual([]);
    });
  }

  it('does not read a comment as a statement', () => {
    // Otherwise a note explaining why a column was *kept* would block the deploy.
    const sql = [
      '-- kolom body sengaja TIDAK di-DROP COLUMN, lihat E17-T08',
      'ALTER TABLE posts ADD COLUMN archived_at timestamptz;',
    ].join('\n');

    expect(inspect(sql).findings).toEqual([]);
  });
});

describe('the approval marker', () => {
  it('lets an intentional drop through, with its reason', () => {
    const sql = [
      '-- curhat:destructive-approved kolom duplikat dari E02, sudah dimigrasikan',
      'ALTER TABLE posts DROP COLUMN legacy_mood;',
    ].join('\n');

    const result = inspect(sql);
    expect(result.findings).toContain('drop_column');
    expect(result.approved).toBe(true);
    expect(result.reason).toMatch(/kolom duplikat/);
  });

  it('has to be inside the migration file, not passed to CI', () => {
    // Typed into the SQL means it shows up in the diff, in review and in
    // `git blame`. A CI flag disappears when the run expires.
    expect(inspect('ALTER TABLE posts DROP COLUMN legacy_mood;').approved).toBe(false);
  });
});
