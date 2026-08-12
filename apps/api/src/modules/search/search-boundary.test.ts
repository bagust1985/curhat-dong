import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What search is not allowed to reach — E13-T03. PRD §13, §15.
 *
 * "Private room messages and AI conversations are never searchable" is a claim
 * about code that does not exist, and those are the hardest claims to keep: a
 * later feature request ("let people find their old conversations") is one
 * plausible afternoon away from a join that quietly makes it false.
 *
 * So it is checked mechanically. This scans the search module for any
 * reference to the tables and models holding private conversation, and fails
 * CI if one appears — before anybody's private room turns up in a result list.
 */

// Vitest runs with apps/api as its working directory.
const here = join(process.cwd(), 'src/modules/search');

/**
 * Tables and Prisma accessors that hold private conversation.
 *
 * Room messages live in `messages` / `prisma.message` — a name generic enough
 * that a substring check would fire on `ai_messages` and on the word in a
 * comment, so each entry is matched as a whole token.
 */
const FORBIDDEN = [
  /\bprisma\.message\b/,
  /\bprisma\.aiMessage\b/,
  /\bprisma\.aiConversation\b/,
  /\bprisma\.chatRoom\b/,
  /\bprisma\.roomMember\b/,
  /\bFROM\s+messages\b/i,
  /\bJOIN\s+messages\b/i,
  /\bai_messages\b/,
  /\bai_conversations\b/,
  /\bchat_rooms\b/,
  /\broom_members\b/,
];

/** Columns that would expose an identity search must never hand out. */
const FORBIDDEN_COLUMNS = [
  'email_hash',
  'emailHash',
  'email_encrypted',
  'provider_id',
  'providerId',
  'trust_score_internal',
  'trustScoreInternal',
  'push_token',
  'pushToken',
];

function searchModuleSources(): Array<{ name: string; content: string }> {
  return readdirSync(here)
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => ({ name: entry, content: readFileSync(join(here, entry), 'utf8') }));
}

describe('search privacy boundary (E13-T03)', () => {
  const sources = searchModuleSources();

  it('scans a plausible number of files', () => {
    // Guards the guard: a broken path would make every assertion below pass
    // over an empty list.
    expect(sources.length).toBeGreaterThanOrEqual(4);
    expect(sources.map((file) => file.name)).toContain('search.service.ts');
  });

  it('never references private conversation storage', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      for (const pattern of FORBIDDEN) {
        if (pattern.test(file.content)) offenders.push(`${file.name}: ${pattern.source}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never selects a column that identifies an account', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      for (const column of FORBIDDEN_COLUMNS) {
        if (file.content.includes(column)) offenders.push(`${file.name}: ${column}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not let the author id out of the query', () => {
    // Returning author_id would let a caller group every anonymous post back
    // to one account — the exact correlation E04-T04 randomises the display
    // code to prevent.
    //
    // Asserted on the row and result types rather than on the SQL text,
    // because those are what actually leaves this file. The column may appear
    // in a WHERE or a JOIN; it must not appear in a shape.
    const service =
      sources.find((file) => file.name === 'search.service.ts')?.content ?? '';

    const shapes = [...service.matchAll(/interface (PostRow|PostResult) \{([\s\S]*?)\n\}/g)];
    expect(shapes).toHaveLength(2);

    for (const [, name, body] of shapes) {
      expect(body, name).not.toMatch(/author_?[Ii]d/);
      expect(body, name).not.toMatch(/user_?[Ii]d/);
    }

    // And the only place the column is named at all is the block filter.
    expect(service).toContain('NOT (p.author_id = ANY(');
  });

  it('restricts the post query to published, undeleted rows', () => {
    const service =
      sources.find((file) => file.name === 'search.service.ts')?.content ?? '';

    // The partial GIN index already excludes anything else (E02-T08), but the
    // filter is written out too: an index is a performance decision that
    // someone could change without realising it was also the safety boundary.
    expect(service).toContain("p.status = 'published'");
    expect(service).toContain('p.deleted_at IS NULL');
  });

  it('logs no search query anywhere', () => {
    // What somebody searches for in a curhat app is at least as sensitive as
    // what they wrote. It is not analytics data (PRD §13).
    for (const file of sources) {
      expect(file.content, file.name).not.toMatch(/logger\.\w+\([^)]*query\.q/);
      expect(file.content, file.name).not.toMatch(/analytics|trackEvent|captureEvent/i);
    }
  });
});
