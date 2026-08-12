import { describe, expect, it } from 'vitest';

import { buildTsQuery, tokenize, wordVariants } from './indonesian-query.js';

describe('tokenizing (E13-T02)', () => {
  it('splits on anything that is not a letter or a digit', () => {
    expect(tokenize('capek  kerja, banget!')).toEqual(['capek', 'kerja', 'banget']);
  });

  it('drops one-character noise', () => {
    expect(tokenize('a capek')).toEqual(['capek']);
  });

  it('yields nothing for a query with no words', () => {
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('!!! ???')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });

  it('caps a very long query', () => {
    const raw = Array.from({ length: 40 }, (_, i) => `kata${i}`).join(' ');
    expect(tokenize(raw)).toHaveLength(8);
  });

  it('leaves nothing that could be tsquery syntax', () => {
    // The real guard is that the value is a bound parameter; this is the
    // second lock. `to_tsquery` parses its argument, so an unescaped `!` or
    // `&` would be operators, and a stray `(` is a syntax error that turns
    // into a 500 for whoever typed it.
    const hostile = "capek & !kerja | (banget):* <-> 'x'";
    for (const token of tokenize(hostile)) {
      expect(token).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe('Indonesian affixes (E13-T01)', () => {
  it('finds a suffixed word from its base', () => {
    // The acceptance criterion: searching "kesepian" must find "kesepiannya".
    // Prefix matching does that half — the indexed token is the longer one.
    expect(wordVariants('kesepian')).toContain('kesepian');
    expect(buildTsQuery('kesepian')).toContain('kesepian:*');
  });

  it('finds a base word from its circumfixed form', () => {
    // The other direction, which prefix matching cannot do: a post that only
    // ever said "sepi" is still what the reader is looking for.
    expect(wordVariants('kesepian')).toContain('sepi');
  });

  it('strips the longest matching affix first', () => {
    // `-kan` before `-an`, `meng-` before `me-`. Taking the short one first
    // leaves a fragment that is not a word.
    expect(wordVariants('memikirkan')).toContain('memikir');
    expect(wordVariants('mengingat')).toContain('ingat');
  });

  it('refuses to strip a word down to a syllable', () => {
    // "diam" minus `di-` is "am", which matches a great deal of Indonesian and
    // means none of it.
    expect(wordVariants('diam')).toEqual(['diam']);
    expect(wordVariants('sedih')).toEqual(['sedih']);
  });

  it('always keeps the word the user actually typed', () => {
    for (const word of ['kesepian', 'sedih', 'memikirkan', 'kerja', 'diam']) {
      expect(wordVariants(word)[0], word).toBe(word);
    }
  });

  it('bounds how far one word can expand the query', () => {
    for (const word of ['kesepian', 'memikirkannya', 'perkembangan']) {
      expect(wordVariants(word).length, word).toBeLessThanOrEqual(4);
    }
  });

  it('does not repeat a form', () => {
    const variants = wordVariants('kesepian');
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe('tsquery assembly', () => {
  it('ANDs separate words and ORs their forms', () => {
    // Two words is a narrowing, not a widening: someone typing "capek kerja"
    // wants posts about both.
    const query = buildTsQuery('capek kerja');

    expect(query).toContain(' & ');
    expect(query).toContain('capek:*');
    expect(query).toContain('kerja:*');
  });

  it('wraps a multi-form word in parentheses so AND binds correctly', () => {
    // Without the parens, `a:* | b:* & c:*` binds as `a | (b & c)` and the
    // second word stops being required.
    const query = buildTsQuery('kesepian kerja') ?? '';

    expect(query).toMatch(/\([^)]*\|[^)]*\) & /);
  });

  it('returns null rather than an empty query', () => {
    // An empty tsquery is a syntax error in Postgres. The caller turns null
    // into an empty result page instead.
    expect(buildTsQuery('   ')).toBeNull();
    expect(buildTsQuery('!!')).toBeNull();
  });

  it('produces a query Postgres can parse', () => {
    // Structural check: balanced parens, no doubled operators, no dangling
    // operator at either end.
    for (const raw of ['kesepian', 'capek kerja banget', 'memikirkannya terus']) {
      const query = buildTsQuery(raw) ?? '';

      const open = (query.match(/\(/g) ?? []).length;
      const close = (query.match(/\)/g) ?? []).length;

      expect(open, raw).toBe(close);
      expect(query, raw).not.toMatch(/[&|]\s*[&|]/);
      expect(query, raw).not.toMatch(/^\s*[&|]|[&|]\s*$/);
    }
  });
});
