'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '../../../../lib/api';
import { CreateCurhat } from '../../../../components/create-curhat';
import type { CategoryOption } from '../../../../components/chips';

/**
 * `/curhat/baru` — E15-T09. DESIGN-REF §2.6.
 *
 * A route rather than a modal held in the feed's state. The design calls it a
 * modal on web, and it looks like one — but giving it a URL means a half-written
 * curhat survives a refresh, a back button behaves the way people expect, and
 * the draft can be reopened from anywhere.
 *
 * The `?mood=` parameter is gone with the Beranda mood strip (E18-T02). It
 * existed to pre-select a mood the composer then asked for again, one screen
 * later; the composer's own picker is the single place that choice is made.
 */
export default function CreateCurhatPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryOption[]>([]);

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
    <main className="mx-auto min-h-screen max-w-2xl px-[var(--spacing-gutter)] py-8">
      <CreateCurhat
        categories={categories}
        onClose={() => router.push('/home')}
        onPublished={(postId) => router.push(`/post/${postId}`)}
        onOpenAi={() => router.push('/ai')}
        onFindListener={() => router.push('/listener/request')}
      />
    </main>
  );
}
