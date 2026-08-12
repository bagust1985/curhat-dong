import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import { randomInt } from 'node:crypto';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';

/**
 * Anonymous aliases — PRD §4, DESIGN-REF §2.3.
 *
 * Words are gentle and neutral by design. An alias is the only name someone
 * carries here, and it should not feel like a joke or a label.
 */
const ADJECTIVES = [
  'Langit',
  'Senja',
  'Embun',
  'Hujan',
  'Kabut',
  'Fajar',
  'Purnama',
  'Bintang',
  'Angin',
  'Ombak',
  'Rembulan',
  'Pelangi',
  'Awan',
  'Bayu',
  'Gerimis',
  'Lentera',
  'Kunang',
  'Cakrawala',
] as const;

const NOUNS = [
  'Malam',
  'Pagi',
  'Sore',
  'Sunyi',
  'Tenang',
  'Damai',
  'Hangat',
  'Teduh',
  'Lembut',
  'Sabar',
  'Jernih',
  'Ranum',
  'Rindu',
  'Harap',
] as const;

/**
 * Long, unambiguous words. Matched anywhere in the alias, because they cannot
 * appear by accident inside an innocent one.
 */
const BLOCKED_SUBSTRINGS = [
  'anjing',
  'bangsat',
  'kontol',
  'memek',
  'ngentot',
  'pepek',
  'jancok',
  'goblok',
  'tolol',
  'idiot',
  'bunuh',
  'moderator',
  'curhatdong',
  'official',
  'sysadmin',
] as const;

/**
 * Short words that DO occur inside ordinary Indonesian words.
 *
 * Matched as whole tokens only. Substring matching here rejects perfectly
 * innocent aliases — "PurnamaSunyi" contains "asu", and "SabarMati"-style
 * accidents are far rarer than that kind of false positive. A generated alias
 * being refused by our own validator is a bug users would report as "the name
 * generator is broken".
 */
const BLOCKED_WORDS = [
  'asu',
  'babi',
  'bego',
  'mati',
  'admin',
  'support',
] as const;

/**
 * Splits an alias into words on separators, digits and camelCase boundaries,
 * so "AsuBesar", "asu_besar" and "asu 1" all yield the token "asu".
 */
function tokenise(alias: string): string[] {
  return alias
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\d]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

export interface AliasSuggestion {
  alias: string;
  available: boolean;
}

@Injectable()
export class AliasService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Builds a random alias, e.g. "LangitMalam" or "SenjaTeduh2847".
   *
   * The numeric suffix appears only when the plain pair is taken, so early
   * users get a clean name and the pool never runs dry.
   */
  generate(): string {
    const adjective = ADJECTIVES[randomInt(0, ADJECTIVES.length)] as string;
    const noun = NOUNS[randomInt(0, NOUNS.length)] as string;
    return `${adjective}${noun}`;
  }

  /** Generates candidates until one is free, then falls back to a suffix. */
  async generateAvailable(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = this.generate();
      if (await this.isAvailable(candidate)) return candidate;
    }

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `${this.generate()}${randomInt(1000, 10_000)}`;
      if (await this.isAvailable(candidate)) return candidate;
    }

    throw ApiException.conflict(
      'ALIAS_TAKEN',
      'Lagi susah cari nama yang pas. Coba tulis sendiri ya.',
    );
  }

  async suggest(count = 5): Promise<AliasSuggestion[]> {
    const suggestions: AliasSuggestion[] = [];
    const seen = new Set<string>();

    while (suggestions.length < count && seen.size < count * 6) {
      const alias = this.generate();
      if (seen.has(alias)) continue;
      seen.add(alias);
      suggestions.push({ alias, available: await this.isAvailable(alias) });
    }

    return suggestions;
  }

  /**
   * Validates a user-chosen alias.
   *
   * Returns a reason rather than a boolean so the UI can say what is wrong
   * instead of just refusing.
   */
  validate(alias: string): { valid: true } | { valid: false; reason: string } {
    const trimmed = alias.trim();

    if (trimmed.length < 3 || trimmed.length > 24) {
      return { valid: false, reason: 'Alias harus 3–24 karakter.' };
    }

    if (!/^[A-Za-z0-9_ ]+$/.test(trimmed)) {
      return {
        valid: false,
        reason: 'Alias cuma boleh huruf, angka, spasi, dan garis bawah.',
      };
    }

    // Separators stripped so "a n j i n g" and "a_n_j_i_n_g" do not slip past.
    const collapsed = trimmed.toLowerCase().replace(/[\s_]/g, '');

    for (const blocked of BLOCKED_SUBSTRINGS) {
      if (collapsed.includes(blocked)) {
        return { valid: false, reason: 'Alias itu nggak bisa dipakai. Coba yang lain ya.' };
      }
    }

    // Short words are checked per token AND against the collapsed form, so
    // "AsuBesar" and "a s u" are both caught while "PurnamaSunyi" is not.
    const tokens = new Set([...tokenise(trimmed), collapsed]);

    for (const blocked of BLOCKED_WORDS) {
      if (tokens.has(blocked)) {
        return { valid: false, reason: 'Alias itu nggak bisa dipakai. Coba yang lain ya.' };
      }
    }

    return { valid: true };
  }

  async isAvailable(alias: string): Promise<boolean> {
    const existing = await this.prisma.userProfile.findUnique({
      where: { aliasLower: alias.trim().toLowerCase() },
      select: { userId: true },
    });
    return existing === null;
  }

  /** Validates and reserves in one step, with distinct errors for each failure. */
  async assertUsable(alias: string): Promise<string> {
    const validation = this.validate(alias);

    if (!validation.valid) {
      throw ApiException.badRequest('ALIAS_INVALID', validation.reason);
    }

    const trimmed = alias.trim();

    if (!(await this.isAvailable(trimmed))) {
      throw ApiException.conflict('ALIAS_TAKEN', 'Alias itu sudah dipakai. Coba yang lain ya.');
    }

    return trimmed;
  }
}
