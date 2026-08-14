'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../../lib/api';
import { EmptyState } from '../../../components/conversation';
import { Input } from '../../../components/ui';

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
      <h1 className="text-[27px] font-black text-[var(--color-text)]">Topik</h1>

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
        <Input
          id="explore-search"
          name="q"
          type="search"
          placeholder="Cari sesuatu…"
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
            {/*
              Deliberately not tinted per topic. In this palette a tint carries
              a meaning — lavender is DONG AI — and cycling colours by grid
              position would invent a meaning that is not there. The icon and
              the name are the real difference between two topics.
            */}
            <button
              type="button"
              onClick={() => router.push(`/search?q=${encodeURIComponent(topic.name)}&tab=topik`)}
              className="flex min-h-[var(--size-touch)] w-full flex-col items-start gap-2 rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
            >
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--color-surface-alt)] text-xl"
              >
                {topic.icon ?? '💬'}
              </span>
              <span className="block font-bold text-[var(--color-text)]">{topic.name}</span>
              <span className="block text-sm text-[var(--color-muted)] tabular-nums">
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
