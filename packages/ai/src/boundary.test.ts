import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The gateway boundary, enforced — E08-T01.
 *
 * "Domain code depends only on the interface" is the kind of rule that holds
 * until the first hurried afternoon. This test scans the workspace so a direct
 * provider call outside `packages/ai` fails CI instead of quietly becoming the
 * reason a provider swap turns into a refactor.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const aiPackage = join(repoRoot, 'packages/ai');

const SCANNED_ROOTS = ['apps', 'packages'];
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.expo',
  'generated',
  'migrations',
]);

/** Provider SDKs. None of these belong outside the adapters. */
const SDK_IMPORTS = [
  '@anthropic-ai/sdk',
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/vertex-sdk',
  'openai',
  '@google/generative-ai',
  '@mistralai/mistralai',
  'cohere-ai',
  'ollama',
];

/** Provider endpoints — the other way a direct call sneaks in. */
const PROVIDER_ENDPOINTS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'];

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry) && !full.startsWith(aiPackage)) {
      files.push(full);
    }
  }

  return files;
}

function collectSourceFiles(): string[] {
  return SCANNED_ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)));
}

describe('AI gateway boundary (E08-T01)', () => {
  const files = collectSourceFiles();

  it('scans a plausible number of files', () => {
    // Guards the guard: a broken path would make every assertion below pass
    // over an empty list.
    expect(files.length).toBeGreaterThan(50);
  });

  it('imports no provider SDK outside packages/ai', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const sdk of SDK_IMPORTS) {
        const pattern = new RegExp(`(from\\s+|require\\()['"]${sdk.replace('/', '\\/')}['"]`);
        if (pattern.test(source)) {
          offenders.push(`${relative(repoRoot, file)} → ${sdk}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('calls no provider endpoint outside packages/ai', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return PROVIDER_ENDPOINTS.some((endpoint) => source.includes(endpoint));
    });

    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it('never puts a provider key in a client-visible env schema', () => {
    const clientEnv = readFileSync(join(repoRoot, 'packages/config/src/env/schema.ts'), 'utf8');
    // Anchored on the declaration, not the first mention — the file's header
    // comment names both schemas.
    const clientBlock = clientEnv.slice(clientEnv.indexOf('export const clientEnvSchema'));

    for (const secret of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AI_LOCAL_API_KEY']) {
      expect(clientBlock).not.toContain(secret);
    }
  });
});
