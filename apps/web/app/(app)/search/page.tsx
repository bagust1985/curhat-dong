'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../lib/api';
import { toCardData, type FeedApiItem } from '../../../lib/feed';
import {
  forgetSearch,
  readRecentSearches,
  rememberSearch,
} from '../../../lib/recent-searches';
import { CurhatCard } from '../../../components/curhat-card';
import { EmptyState, ListenerCard } from '../../../components/conversation';

/**
 * `/search` — E15-T15. DESIGN-REF §2.13.
 *
 * Recent searches are read from and written to the device only
 * (`lib/recent-searches.ts`). There is no endpoint that accepts a search
 * history, and this page must never become the first one: what somebody
 * searches for here is a question they have not decided to say out loud yet.
 */

type Tab = 'curhat' | 'listener' | 'topik';

interface SearchResponse {
  tab: Tab;
  query: string;
  posts: FeedApiItem[];
  listeners: Array<{
    alias: string;
    avatar: string | null;
    bio: string | null;
    topics: string[];
    isAvailable: boolean;
    helpfulCount: number;
  }>;
  topics: Array<{ slug: string; name: string; icon: string | null; activePosts: number }>;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'curhat', label: 'Curhat' },
  { key: 'listener', label: 'Listener' },
  { key: 'topik', label: 'Topik' },
];

function SearchView() {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab | null) ?? 'curhat');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRecent(readRecentSearches());
  }, []);

  const run = useCallback(
    async (value: string, nextTab: Tab) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;

      setLoading(true);
      try {
        const { data } = await api<SearchResponse>('/search', {
          query: { q: trimmed, tab: nextTab },
        });
        setResults(data);
        setRecent(rememberSearch(trimmed));
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Runs the query that arrived in the URL, once. `ran` guards it because
  // `run` and `tab` both change afterwards, and re-running on every change
  // would fire a search per keystroke of the tab state.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    const initial = params.get('q');
    if (!initial) return;
    ran.current = true;
    void run(initial, tab);
  }, [params, run, tab]);

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Cari</h1>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(query, tab);
        }}
      >
        <label htmlFor="search-input" className="sr-only">
          Kata kunci
        </label>
        <input
          id="search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />
      </form>

      <div role="tablist" aria-label="Jenis hasil" className="mt-4 flex gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => {
              setTab(entry.key);
              void run(query, entry.key);
            }}
            className={`min-h-[var(--size-touch)] rounded-[var(--radius-chip)] border px-4 text-sm ${
              tab === entry.key
                ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold text-[var(--color-text)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {results === null && recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="mt-6">
          <h2 id="recent-heading" className="text-base font-semibold text-[var(--color-text)]">
            Terakhir kamu cari
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Cuma tersimpan di perangkat ini.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recent.map((entry) => (
              <li key={entry} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setQuery(entry);
                    void run(entry, tab);
                  }}
                  className="min-h-[var(--size-touch)] rounded-[var(--radius-chip)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)]"
                >
                  {entry}
                </button>
                <button
                  type="button"
                  aria-label={`Hapus "${entry}" dari riwayat`}
                  onClick={() => setRecent(forgetSearch(entry))}
                  className="min-h-[var(--size-touch)] px-2 text-sm text-[var(--color-muted)]"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <p role="status" className="mt-6 text-sm text-[var(--color-muted)]">
          Lagi nyari…
        </p>
      ) : null}

      {results ? (
        <section className="mt-6">
          {tab === 'curhat' ? (
            results.posts.length === 0 ? (
              <EmptyState context="search" onAction={() => router.push('/explore')} />
            ) : (
              <ul className="flex flex-col gap-4">
                {results.posts.map((post) => (
                  <li key={post.id}>
                    <CurhatCard
                      {...toCardData(post, {})}
                      onOpen={(id) => router.push(`/post/${id}`)}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === 'listener' ? (
            results.listeners.length === 0 ? (
              <EmptyState context="search" onAction={() => router.push('/explore')} />
            ) : (
              <ul className="flex flex-col gap-3">
                {results.listeners.map((listener) => (
                  <li key={listener.alias}>
                    <ListenerCard
                      alias={listener.alias}
                      bio={listener.bio}
                      topics={listener.topics}
                      isAvailable={listener.isAvailable}
                      onRequest={(alias) => router.push(`/profile/${alias}`)}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === 'topik' ? (
            results.topics.length === 0 ? (
              <EmptyState context="search" onAction={() => router.push('/explore')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {results.topics.map((topic) => (
                  <li key={topic.slug}>
                    <button
                      type="button"
                      onClick={() => router.push(`/explore`)}
                      className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left text-[var(--color-text)]"
                    >
                      <span aria-hidden="true">{topic.icon ?? '💬'} </span>
                      {topic.name}
                      <span className="block text-sm text-[var(--color-muted)]">
                        {topic.activePosts} cerita aktif
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p role="status">Sebentar ya…</p>}>
      <SearchView />
    </Suspense>
  );
}
