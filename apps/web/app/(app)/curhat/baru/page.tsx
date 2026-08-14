'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MOODS, type Mood } from '@curhat/types';

import { api } from '../../../../lib/api';
import { CreateCurhat } from '../../../../components/create-curhat';
import type { CategoryOption } from '../../../../components/chips';

/**
 * `/curhat/baru` — E15-T09. DESIGN-REF §2.6.
 *
 * A route rather than a modal held in the feed's state. The design calls it a
 * modal on web, and it looks like one — but giving it a URL means a half-written
 * curhat survives a refresh, a back button behaves the way people expect, and
 * the draft can be reopened from anywhere. The overlay is presentation; the
 * route is the thing that makes it recoverable.
 *
 * `?mood=` is set by the mood strip on `/home` (E18-T01). It is validated
 * against the vocabulary rather than trusted: the value comes from a URL, and
 * an unknown mood should open an ordinary blank composer, not a broken one.
 */
function CreateCurhatScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const requested = params.get('mood');
  const initialMood = (MOODS as readonly string[]).includes(requested ?? '')
    ? (requested as Mood)
    : null;

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<Array<{ slug: string; name: string }>>('/categories');
        setCategories(data);
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  return (
    <CreateCurhat
      categories={categories}
      initialMood={initialMood}
      onClose={() => router.push('/home')}
      onPublished={(postId) => router.push(`/post/${postId}`)}
      onOpenAi={() => router.push('/ai')}
      onFindListener={() => router.push('/listener/request')}
    />
  );
}

export default function CreateCurhatPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-[var(--spacing-gutter)] py-8">
      {/* useSearchParams needs a boundary; the composer is the whole screen. */}
      <Suspense fallback={null}>
        <CreateCurhatScreen />
      </Suspense>
    </main>
  );
}
