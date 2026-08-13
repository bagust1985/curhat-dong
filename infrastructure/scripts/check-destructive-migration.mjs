#!/usr/bin/env node
/**
 * Destructive-migration gate — E17-T04. CLAUDE.md non-negotiable #7.
 *
 * Scans pending migration SQL and refuses to let the pipeline apply anything
 * that can lose data without a human having said so.
 *
 * ## Why a scanner and not a review policy
 *
 * "Destructive migrations require manual review" is already the rule. The
 * failure mode is not that someone disagrees with it — it is that a `DROP
 * COLUMN` rides along inside a twelve-file migration nobody read closely at
 * 23:00. So the pipeline reads the SQL instead of trusting that somebody did.
 *
 * ## How to approve one
 *
 * Put the marker below in the migration file, on its own line:
 *
 *     -- curhat:destructive-approved <reason>
 *
 * That is deliberately awkward. It has to be typed into the migration itself,
 * so it appears in the diff, in review, and in `git blame` — not passed as a
 * CI flag that disappears from history.
 *
 * Usage:
 *   node check-destructive-migration.mjs <migrations-dir> [--since <name>]
 *
 * Exit 0 = safe to apply. Exit 1 = stop, unapproved destructive statement.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Statements that can destroy data that exists.
 *
 * `ALTER COLUMN ... TYPE` is on the list because a narrowing type change
 * silently truncates, which is worse than a drop: a drop is obvious afterwards.
 * `SET NOT NULL` is on it because it fails the whole deployment when the column
 * has nulls, and finding that out mid-deploy is the situation this gate exists
 * to avoid.
 */
export const DESTRUCTIVE_PATTERNS = [
  { id: 'drop_table', pattern: /\bDROP\s+TABLE\b/i },
  { id: 'drop_column', pattern: /\bDROP\s+COLUMN\b/i },
  { id: 'drop_schema', pattern: /\bDROP\s+SCHEMA\b/i },
  { id: 'drop_database', pattern: /\bDROP\s+DATABASE\b/i },
  { id: 'truncate', pattern: /\bTRUNCATE\b/i },
  { id: 'delete_without_where', pattern: /\bDELETE\s+FROM\s+[\w."]+\s*;/i },
  { id: 'alter_column_type', pattern: /\bALTER\s+COLUMN\b[\s\S]{0,80}?\bTYPE\b/i },
  { id: 'set_not_null', pattern: /\bSET\s+NOT\s+NULL\b/i },
  { id: 'drop_constraint', pattern: /\bDROP\s+CONSTRAINT\b/i },
  { id: 'rename_column', pattern: /\bRENAME\s+COLUMN\b/i },
  { id: 'rename_table', pattern: /\bRENAME\s+TO\b/i },
];

export const APPROVAL_MARKER = /^--\s*curhat:destructive-approved\b(.*)$/im;

/** Strips comments so an approval marker cannot be matched as a statement. */
function withoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

export function inspectSql(sql) {
  const approval = sql.match(APPROVAL_MARKER);
  const body = withoutComments(sql);

  const findings = DESTRUCTIVE_PATTERNS.filter((entry) => entry.pattern.test(body)).map(
    (entry) => entry.id,
  );

  return {
    findings,
    approved: Boolean(approval),
    reason: approval ? (approval[1] ?? '').trim() : '',
  };
}

export function inspectDirectory(dir, since) {
  const names = readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();

  // Prisma names migrations with a timestamp prefix, so lexical order is
  // chronological order.
  const pending = since ? names.filter((name) => name > since) : names;

  return pending.map((name) => {
    const file = join(dir, name, 'migration.sql');
    let sql = '';
    try {
      sql = readFileSync(file, 'utf8');
    } catch {
      return { name, findings: ['unreadable'], approved: false, reason: '' };
    }
    return { name, ...inspectSql(sql) };
  });
}

function main() {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: check-destructive-migration.mjs <migrations-dir> [--since <name>]');
    process.exit(2);
  }

  const sinceIndex = rest.indexOf('--since');
  const since = sinceIndex >= 0 ? rest[sinceIndex + 1] : undefined;

  const results = inspectDirectory(dir, since);
  const blocking = results.filter((entry) => entry.findings.length > 0 && !entry.approved);
  const approved = results.filter((entry) => entry.findings.length > 0 && entry.approved);

  for (const entry of approved) {
    console.log(
      `disetujui manual: ${entry.name} (${entry.findings.join(', ')}) — ${entry.reason || 'tanpa alasan tertulis'}`,
    );
  }

  if (blocking.length === 0) {
    console.log(`aman: ${results.length} migration diperiksa, tidak ada yang destruktif tanpa persetujuan`);
    process.exit(0);
  }

  console.error('DEPLOY DIHENTIKAN — migration destruktif tanpa persetujuan manual:');
  for (const entry of blocking) {
    console.error(`  ${entry.name}: ${entry.findings.join(', ')}`);
  }
  console.error('');
  console.error('Kalau memang disengaja, tambahkan baris ini di file migration-nya:');
  console.error('  -- curhat:destructive-approved <alasan singkat>');
  process.exit(1);
}

// Only runs as a CLI; importing it for tests must not exit the process.
if (process.argv[1] && process.argv[1].endsWith('check-destructive-migration.mjs')) {
  main();
}
