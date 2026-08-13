import { INTENTS, MOODS, type Intent, type Mood } from '@curhat/types';

import { relativeTime } from './relative-time';
import type { CurhatCardVariant } from '../components/curhat-card';

/**
 * Feed data shaping — E15-T08.
 *
 * The API returns `mood` and `intent` as plain strings (feed.service.ts). The
 * card takes the typed vocabulary, so the conversion happens here, once, with
 * a fallback: an unknown mood added server-side must not blank out a card in a
 * client that has not shipped yet.
 */

export interface FeedApiItem {
  id: string;
  title: string | null;
  excerpt: string;
  mood: string;
  intent: string;
  categorySlug: string;
  authorAlias: string;
  isAnonymous: boolean;
  responseCount: number;
  commentCount: number;
  createdAt: string;
  needsListener: boolean;
}

export function toMood(value: string): Mood {
  return (MOODS as readonly string[]).includes(value) ? (value as Mood) : 'kosong';
}

export function toIntent(value: string): Intent {
  return (INTENTS as readonly string[]).includes(value) ? (value as Intent) : 'cuma_didengar';
}

export interface FeedCardData {
  postId: string;
  title: string | null;
  excerpt: string;
  mood: Mood;
  intent: Intent;
  categoryName: string;
  authorLabel: string;
  isAnonymous: boolean;
  replyCount: number;
  createdAtLabel: string;
  variant: CurhatCardVariant;
}

export function toCardData(
  item: FeedApiItem,
  categoryNames: Record<string, string>,
  now: Date = new Date(),
): FeedCardData {
  return {
    postId: item.id,
    title: item.title,
    excerpt: item.excerpt,
    mood: toMood(item.mood),
    intent: toIntent(item.intent),
    // Falls back to the slug rather than to "Tanpa kategori": the slug is at
    // least true.
    categoryName: categoryNames[item.categorySlug] ?? item.categorySlug,
    authorLabel: item.authorAlias,
    isAnonymous: item.isAnonymous,
    replyCount: item.commentCount,
    createdAtLabel: relativeTime(item.createdAt, now),
    variant: item.needsListener ? 'butuh-didengar' : item.isAnonymous ? 'anonymous' : 'default',
  };
}

/**
 * Appends a page, dropping anything already on screen.
 *
 * Cursor pagination is stable, but two things still produce duplicates: a post
 * created between two page loads shifts the window, and a fast scroll can fire
 * the loader twice before the first response lands. Both end with the same
 * curhat appearing twice in the list, which reads as a bug in the product
 * rather than in the pagination.
 */
export function mergePages(current: readonly FeedApiItem[], incoming: readonly FeedApiItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
