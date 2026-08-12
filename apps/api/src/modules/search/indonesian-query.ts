/**
 * Query building for Indonesian full-text search — E13-T01, TECH-SPEC §2.4.
 *
 * PostgreSQL ships no Indonesian stemmer, so E02-T08 indexes with the `simple`
 * configuration: tokens go in exactly as written. `english` would have been
 * worse than nothing — it stems by English rules, which mangles Indonesian
 * words in ways that are hard to predict and impossible to explain to a user
 * wondering why their search found nothing.
 *
 * That leaves affixes to the query layer, which is what this file is. Given
 * one word, it produces the small set of forms that word could plausibly be
 * indexed under, and ORs them together:
 *
 *   "kesepian"  →  kesepian:* | kesepi:* | sepian:* | sepi:*
 *
 * Prefix matching (`:*`) covers suffixes that stay attached to the indexed
 * token — searching "kesepian" finds "kesepiannya". Stripping covers the other
 * direction: searching "kesepian" also finds a post that only ever said
 * "sepi".
 *
 * This is deliberately a cheap approximation, not a stemmer. It over-generates
 * a little (a broader search returns a few loose matches) rather than
 * under-generating (a search that finds nothing, which people read as "this
 * app is broken"). A real Nazief-Adriani stemmer is a bigger change than
 * Phase 1 warrants — TECH-SPEC §2.4 puts Elasticsearch out of scope for the
 * same reason.
 */

/**
 * Shortest stem worth searching for.
 *
 * Below four characters the stripped form stops being a word and starts being
 * a syllable: "diam" minus the `di-` prefix is "am", which would match a great
 * deal of Indonesian and mean none of it.
 */
const MIN_STEM_LENGTH = 4;

/** Longest prefixes first, so `meng-` is tried before `me-`. */
const PREFIXES = [
  'menge',
  'meng',
  'meny',
  'mem',
  'men',
  'me',
  'peng',
  'peny',
  'pem',
  'pen',
  'pe',
  'ber',
  'bel',
  'be',
  'ter',
  'tel',
  'te',
  'di',
  'ke',
  'se',
];

/** Longest suffixes first, so `-kan` is tried before `-an`. */
const SUFFIXES = ['kannya', 'annya', 'nya', 'kan', 'an', 'ku', 'mu', 'lah', 'kah', 'pun'];

/** At most this many words are honoured; the rest of a long query is dropped. */
const MAX_TERMS = 8;

/** At most this many forms per word, so one term cannot explode the query. */
const MAX_VARIANTS_PER_TERM = 4;

function stripPrefix(word: string): string | null {
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= MIN_STEM_LENGTH) {
      return word.slice(prefix.length);
    }
  }
  return null;
}

function stripSuffix(word: string): string | null {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH) {
      return word.slice(0, -suffix.length);
    }
  }
  return null;
}

/**
 * Forms a word might be indexed under, most specific first.
 *
 * The circumfix case is the one that earns its keep: Indonesian wraps words in
 * `ke-…-an`, `per-…-an`, `me-…-kan`, and a reader searching "kesedihan" is
 * looking for posts that said "sedih".
 */
export function wordVariants(word: string): string[] {
  const variants = [word];

  const withoutSuffix = stripSuffix(word);
  if (withoutSuffix) variants.push(withoutSuffix);

  const withoutPrefix = stripPrefix(word);
  if (withoutPrefix) variants.push(withoutPrefix);

  if (withoutSuffix) {
    const circumfix = stripPrefix(withoutSuffix);
    if (circumfix) variants.push(circumfix);
  }

  return [...new Set(variants)].slice(0, MAX_VARIANTS_PER_TERM);
}

/**
 * Splits a raw query into searchable words.
 *
 * Everything that is not a letter or a digit is a separator, which doubles as
 * the injection guard: what comes out of here can only ever be `[a-z0-9]`, so
 * no user input reaches `to_tsquery` as syntax. The query text is still passed
 * as a bound parameter — this is the second lock, not the only one.
 */
export function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 2)
    .slice(0, MAX_TERMS);
}

/**
 * Builds a `to_tsquery` expression, or null when there is nothing to search.
 *
 * Words are ANDed and their forms ORed: `(a:* | a2:*) & (b:* | b2:*)`. AND
 * between words because a two-word search is a narrowing, not a widening —
 * someone typing "capek kerja" wants posts about both.
 */
export function buildTsQuery(raw: string): string | null {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return null;

  return tokens
    .map((token) => {
      const forms = wordVariants(token).map((variant) => `${variant}:*`);
      return forms.length === 1 ? forms[0] : `(${forms.join(' | ')})`;
    })
    .join(' & ');
}
