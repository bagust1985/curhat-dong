'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NetworkError, api } from '../../../lib/api';
import { feedGreeting } from '../../../lib/midnight';
import { mergePages, toCardData, type FeedApiItem } from '../../../lib/feed';
import { useSession } from '../../../lib/session';
import { CurhatCard } from '../../../components/curhat-card';
import { EmptyState } from '../../../components/conversation';
import {
  FEED_TABS,
  FeedSkeleton,
  FeedTabs,
  ListenerNudgeBanner,
  OfflineBanner,
  PrivateAiEntryCard,
  QuickLinksGrid,
  StartCurhatCard,
  type FeedTabKey,
} from '../../../components/feed';

/**
 * `/home` — E15-T08. DESIGN-REF §2.4, PRD §6.
 *
 * Four tabs over one endpoint. Each tab keeps its own list and cursor so
 * switching back does not refetch what the reader already had, and every page
 * goes through `mergePages` — a curhat appearing twice reads as a broken
 * product, not as a pagination edge case.
 *
 * Nothing on this screen counts a person. No follower count, no leaderboard,
 * no "you helped N people" (PRD §11); the listener nudge states a need and
 * offers a way out of it in the same breath.
 */

interface TabState {
  items: FeedApiItem[];
  cursor: string | null;
  loading: boolean;
  loaded: boolean;
  offline: boolean;
}

const EMPTY_TAB: TabState = {
  items: [],
  cursor: null,
  loading: false,
  loaded: false,
  offline: false,
};

export default function HomePage() {
  const router = useRouter();
  const { status, user } = useSession();

  const [tab, setTab] = useState<FeedTabKey>('terbaru');
  const [tabs, setTabs] = useState<Record<FeedTabKey, TabState>>({
    'untuk-kamu': EMPTY_TAB,
    terbaru: EMPTY_TAB,
    'butuh-didengar': EMPTY_TAB,
    topik: EMPTY_TAB,
  });
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [waitingCount, setWaitingCount] = useState(0);

  // Guards the loader against a fast scroll firing it again before the first
  // response lands. A ref rather than state: it has to be true *now*, not after
  // the next render.
  const inFlight = useRef<Partial<Record<FeedTabKey, boolean>>>({});
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/auth');
    if (status === 'onboarding') router.replace('/onboarding');
  }, [router, status]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<Array<{ slug: string; name: string }>>('/categories');
        setCategoryNames(Object.fromEntries(data.map((item) => [item.slug, item.name])));
      } catch {
        // Slugs are shown instead. Not worth an error state on the feed.
      }
    })();
  }, []);

  useEffect(() => {
    if (!user?.isListener) return;
    void (async () => {
      try {
        const { data } = await api<{ items: unknown[] }>('/feed', {
          query: { tab: 'butuh-didengar', limit: 5 },
        });
        setWaitingCount(data.items.length);
      } catch {
        setWaitingCount(0);
      }
    })();
  }, [user?.isListener]);

  const load = useCallback(
    async (key: FeedTabKey, mode: 'first' | 'more' | 'refresh') => {
      if (inFlight.current[key]) return;
      const state = tabs[key];
      if (mode === 'more' && !state.cursor) return;

      inFlight.current[key] = true;
      setTabs((current) => ({ ...current, [key]: { ...current[key], loading: true } }));

      try {
        const { data } = await api<{ items: FeedApiItem[]; nextCursor: string | null }>('/feed', {
          query: {
            tab: key,
            limit: 20,
            ...(mode === 'more' && state.cursor ? { cursor: state.cursor } : {}),
          },
        });

        setTabs((current) => ({
          ...current,
          [key]: {
            items:
              mode === 'more' ? mergePages(current[key].items, data.items) : [...data.items],
            cursor: data.nextCursor,
            loading: false,
            loaded: true,
            offline: false,
          },
        }));
      } catch (error) {
        setTabs((current) => ({
          ...current,
          [key]: {
            ...current[key],
            loading: false,
            loaded: true,
            offline: error instanceof NetworkError,
          },
        }));
      } finally {
        inFlight.current[key] = false;
      }
    },
    [tabs],
  );

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (tabs[tab].loaded || tabs[tab].loading) return;
    void load(tab, 'first');
  }, [load, status, tab, tabs]);

  // Infinite scroll where the browser supports it; the button below is the
  // fallback and also the keyboard-reachable way to do the same thing.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void load(tab, 'more');
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [load, tab]);

  const state = tabs[tab];
  const emptyContext = useMemo(
    () => FEED_TABS.find((item) => item.key === tab)?.emptyContext ?? 'feed',
    [tab],
  );

  const cards = state.items.map((item) => toCardData(item, categoryNames));

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <main className="flex-1 px-[var(--spacing-gutter)] pt-8 pb-28">
        {/*
         * The mock's opening: a personal greeting, then the one action this
         * screen exists to offer, then the shelf of features. The feed follows
         * — it stays on this screen because it *is* the product (E05, PRD §6)
         * and the North Star depends on people answering each other; a home
         * screen that only launches features would quietly demote it.
         */}
        <h1 className="text-2xl font-extrabold text-[var(--color-text)]">
          {user ? `Hai, ${user.alias} 👋` : 'Hai 👋'}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{feedGreeting()}</p>

        <div className="mt-5 flex flex-col gap-5">
          <StartCurhatCard onStart={() => router.push('/curhat/baru')} />

          <QuickLinksGrid onOpen={(link) => router.push(link.href)} />

          {user?.isListener && !nudgeDismissed ? (
            <ListenerNudgeBanner
              waiting={waitingCount}
              onOpen={() => setTab('butuh-didengar')}
              onDismiss={() => setNudgeDismissed(true)}
            />
          ) : null}

          <PrivateAiEntryCard onOpen={() => router.push('/ai')} />
        </div>

        <h2 className="mt-8 text-base font-bold text-[var(--color-text)]">Cerita Terbaru</h2>

        <div className="mt-3">
          <FeedTabs active={tab} onSelect={setTab} />
        </div>

        <section
          id="feed-panel"
          role="tabpanel"
          aria-labelledby={`feed-tab-${tab}`}
          className="mt-4"
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => void load(tab, 'refresh')}
              className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
            >
              Muat ulang
            </button>
          </div>

          {state.offline ? <OfflineBanner onRetry={() => void load(tab, 'refresh')} /> : null}

          {!state.loaded && state.loading ? <FeedSkeleton /> : null}

          {state.loaded && state.items.length === 0 && !state.offline ? (
            <EmptyState
              context={emptyContext}
              onAction={() => {
                if (emptyContext === 'untukKamu') router.push('/settings');
                else router.push('/curhat/baru');
              }}
            />
          ) : null}

          <ul className="flex flex-col gap-4">
            {cards.map((card) => (
              <li key={card.postId}>
                <CurhatCard {...card} onOpen={(id) => router.push(`/post/${id}`)} />
              </li>
            ))}
          </ul>

          <div ref={sentinel} aria-hidden="true" className="h-px" />

          {state.cursor ? (
            <button
              type="button"
              onClick={() => void load(tab, 'more')}
              disabled={state.loading}
              className="mt-6 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 text-sm font-semibold text-[var(--color-text)] disabled:opacity-60"
            >
              {state.loading ? 'Lagi dimuat…' : 'Muat lebih banyak'}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
