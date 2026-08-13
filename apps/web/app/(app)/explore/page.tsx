'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../../lib/api';
import { EmptyState } from '../../../components/conversation';

/**
 * `/explore` — E15-T15. DESIGN-REF §2.12.
 *
 * A grid of topics with how many curhat are active in each. That count is the
 * one number worth showing: it answers "will anyone read me if I post here",
 * which is the actual question somebody has when choosing a topic.
 */

interface Topic {
  slug: string;
  name: string;
  icon: string | null;
  activePosts: number;
}

export default function ExplorePage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<Topic[]>('/explore');
        setTopics(data);
      } catch {
        setTopics([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Topik</h1>

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          router.push(`/search?q=${encodeURIComponent(String(value ?? ''))}`);
        }}
      >
        <label htmlFor="explore-search" className="sr-only">
          Cari curhat, listener, atau topik
        </label>
        <input
          id="explore-search"
          name="q"
          type="search"
          placeholder="Cari sesuatu…"
          className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />
      </form>

      {loaded && topics.length === 0 ? (
        <div className="mt-6">
          <EmptyState context="feed" onAction={() => router.push('/curhat/baru')} />
        </div>
      ) : null}

      <ul className="mt-6 grid grid-cols-2 gap-3">
        {topics.map((topic) => (
          <li key={topic.slug}>
            <button
              type="button"
              onClick={() => router.push(`/search?q=${encodeURIComponent(topic.name)}&tab=topik`)}
              className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left"
            >
              <span className="block text-lg" aria-hidden="true">
                {topic.icon ?? '💬'}
              </span>
              <span className="mt-1 block font-semibold text-[var(--color-text)]">
                {topic.name}
              </span>
              <span className="block text-sm text-[var(--color-muted)]">
                {topic.activePosts === 0
                  ? 'Belum ada cerita'
                  : `${topic.activePosts} cerita aktif`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
