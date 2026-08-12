import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, '..', relative), 'utf8');

/**
 * Privacy-first SEO — PRD §13, CLAUDE.md non-negotiable #5.
 *
 * Checked in CI rather than by manual crawl: a page that becomes indexable is
 * not something anyone notices until it shows up in a search result, and by
 * then someone's curhat is already public.
 */
describe('noindex enforcement', () => {
  const nextConfig = read('next.config.ts');
  const layout = read('app/layout.tsx');

  it('sends X-Robots-Tag on every route', () => {
    expect(nextConfig).toContain('X-Robots-Tag');
    expect(nextConfig).toContain('noindex');
    // Applied to /:path* so a new route is covered by default rather than
    // needing to be remembered.
    expect(nextConfig).toContain('/:path*');
  });

  it('declares noindex in the root metadata as well', () => {
    // Belt and braces: the header covers crawlers, the meta tag covers
    // anything reading the rendered HTML.
    expect(layout).toMatch(/robots:\s*\{[^}]*index:\s*false/s);
    expect(layout).toMatch(/robots:\s*\{[^}]*follow:\s*false/s);
  });

  it('does not put curhat content in metadata', () => {
    // An OG description built from post bodies would leak the content into
    // link previews and crawler caches even with noindex set.
    expect(layout).not.toMatch(/openGraph[\s\S]*body/);
  });
});

describe('admin noindex', () => {
  it('is at least as strict as the public app', () => {
    const adminConfig = readFileSync(
      join(here, '../../admin/next.config.ts'),
      'utf8',
    );
    expect(adminConfig).toContain('noindex');
    expect(adminConfig).toContain('noarchive');
  });
});
