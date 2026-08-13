'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Reaction } from '@curhat/types';

import { ApiError, api } from '../../../../lib/api';
import { toIntent, toMood } from '../../../../lib/feed';
import { PERSONAL_DATA_WARNING, detectPersonalData } from '../../../../lib/personal-data';
import { relativeTime } from '../../../../lib/relative-time';
import { IntentBadge, MoodChip } from '../../../../components/chips';
import { CommentItem, EmptyState } from '../../../../components/conversation';
import { ReactionBar } from '../../../../components/reaction-bar';
import { BlockDialog, FeltHeardSheet, ReportSheet } from '../../../../components/safety';

/**
 * `/post/:id` — E15-T11. DESIGN-REF §2.5, PRD §9.
 *
 * Three states this page has to render honestly rather than as an error:
 *
 *  - **held** — the author's own post under review. Visible only to them, and
 *    it says so; anyone else gets the not-found screen, because confirming that
 *    a held post exists would leak that somebody wrote something flagged;
 *  - **deleted** — gone, said plainly, with no attempt to explain who removed it;
 *  - **comments locked** — the thread is closed, and the composer is replaced by
 *    a sentence rather than a disabled box with no explanation.
 *
 * The Felt Heard prompt is fetched from `/me/felt-heard/pending`, which has
 * already applied the anti-fatigue rules (E06-T06). The client does not decide
 * when to ask — it only decides not to cover the content with it.
 */

interface PostDetail {
  id: string;
  title: string | null;
  body: string;
  mood: string;
  intent: string;
  categorySlug: string;
  categoryName: string;
  authorAlias: string;
  isAnonymous: boolean;
  allowComments: boolean;
  responseCount: number;
  reactionCounts: Record<string, number>;
  commentCount: number;
  createdAt: string;
  isOwn: boolean;
  status?: string;
}

interface CommentNode {
  id: string;
  body: string;
  authorAlias: string;
  isOwn: boolean;
  isMarkedHelpful: boolean;
  parentId: string | null;
  createdAt: string;
  replies: CommentNode[];
}

interface PendingPrompt {
  promptId: string;
  targetType: string;
  targetId: string;
  question: string;
}

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params.id;

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Reaction[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Reaction, number>>>({});
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [composerAck, setComposerAck] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PendingPrompt | null>(null);
  const [sheet, setSheet] = useState<'none' | 'report' | 'block'>('none');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api<PostDetail>(`/posts/${postId}`);
      setPost(data);
      setCounts(data.reactionCounts as Partial<Record<Reaction, number>>);
      const { data: page } = await api<{ items: CommentNode[] }>(`/posts/${postId}/comments`);
      setComments(page.items);
    } catch (cause) {
      // 404 covers deleted, never-existed, and somebody else's held post. The
      // page cannot tell them apart, and should not try.
      if (cause instanceof ApiError && (cause.status === 404 || cause.code === 'NOT_FOUND')) {
        setMissing(true);
      } else if (cause instanceof ApiError && cause.code === 'POST_HELD_FOR_REVIEW') {
        setMissing(true);
      } else {
        setError('Curhatnya belum bisa dimuat. Coba lagi sebentar lagi ya.');
      }
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<PendingPrompt[]>('/me/felt-heard/pending');
        setPrompt(data.find((entry) => entry.targetId === postId) ?? null);
      } catch {
        setPrompt(null);
      }
    })();
  }, [postId]);

  const toggleReaction = useCallback(
    async (reaction: Reaction) => {
      const given = mine.includes(reaction);
      // Optimistic: a reaction that waits for a round trip feels broken.
      setMine((current) =>
        given ? current.filter((entry) => entry !== reaction) : [...current, reaction],
      );

      try {
        const { data } = await api<{ counts: Record<string, number> }>(
          given ? `/posts/${postId}/reactions/${reaction}` : `/posts/${postId}/reactions`,
          given ? { method: 'DELETE' } : { method: 'PUT', body: { type: reaction } },
        );
        setCounts(data.counts as Partial<Record<Reaction, number>>);
      } catch {
        setMine((current) =>
          given ? [...current, reaction] : current.filter((entry) => entry !== reaction),
        );
      }
    },
    [mine, postId],
  );

  const sendComment = useCallback(async () => {
    if (composer.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      await api(`/posts/${postId}/comments`, {
        method: 'POST',
        body: {
          body: composer.trim(),
          ...(replyTo ? { parentId: replyTo } : {}),
        },
      });
      setComposer('');
      setReplyTo(null);
      setComposerAck(false);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'COMMENTS_LOCKED') {
        setError('Balasan buat curhat ini udah ditutup.');
      } else if (cause instanceof ApiError && cause.code === 'USER_BLOCKED') {
        setError('Kamu nggak bisa membalas curhat ini.');
      } else {
        setError('Balasanmu belum kekirim. Coba lagi ya.');
      }
    } finally {
      setSending(false);
    }
  }, [composer, load, postId, replyTo]);

  const markHelpful = useCallback(
    async (commentId: string) => {
      try {
        await api(`/comments/${commentId}/helpful`, { method: 'POST', body: { helpful: true } });
        await load();
      } catch {
        setError('Belum bisa ditandai. Coba lagi ya.');
      }
    },
    [load],
  );

  const answerPrompt = useCallback(
    async (answer: 'yes' | 'somewhat' | 'no') => {
      const current = prompt;
      setPrompt(null);
      if (!current) return;
      try {
        await api('/felt-heard/answer', {
          method: 'POST',
          body: { promptId: current.promptId, answer },
        });
      } catch {
        /* the answer is not worth an error screen */
      }
    },
    [prompt],
  );

  const dismissPrompt = useCallback(async () => {
    const current = prompt;
    setPrompt(null);
    if (!current) return;
    try {
      // Dismissed, not "no" — the distinction is what keeps the North Star
      // measuring being heard rather than prompt fatigue (E06-T06).
      await api(`/felt-heard/${current.promptId}/dismiss`, { method: 'POST', body: {} });
    } catch {
      /* nothing to recover */
    }
  }, [prompt]);

  const composerHints = detectPersonalData(composer);

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10">
        <p role="status">Lagi memuat curhat…</p>
      </main>
    );
  }

  if (missing || !post) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-10">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Curhatnya udah nggak ada</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
          Mungkin dihapus penulisnya, atau memang nggak pernah ada. Nggak apa-apa — masih banyak
          cerita lain.
        </p>
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="mt-6 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
        >
          Balik ke beranda
        </button>
      </main>
    );
  }

  const held = post.status === 'held';

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8 pb-24">
      {held ? (
        <div
          role="status"
          className="mb-4 rounded-[var(--radius-curhat)] border border-dashed border-[var(--color-muted)] p-4"
        >
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Curhatmu kami tinjau dulu sebentar ya
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Baru kamu yang bisa lihat ini. Ini bukan hukuman.
          </p>
        </div>
      ) : null}

      <article aria-labelledby="post-heading">
        <header className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
          <span>{post.authorAlias}</span>
          <span aria-hidden="true">·</span>
          <span>{post.categoryName}</span>
          <span aria-hidden="true">·</span>
          <time>{relativeTime(post.createdAt)}</time>
        </header>

        <h1 id="post-heading" className="mt-3 text-2xl font-bold text-[var(--color-text)]">
          {post.title ?? 'Curhat'}
        </h1>

        <p className="mt-4 leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">
          {post.body}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <MoodChip mood={toMood(post.mood)} />
          <IntentBadge intent={toIntent(post.intent)} />
        </div>

        <div className="mt-6">
          <ReactionBar
            counts={counts}
            mine={mine}
            onToggle={(reaction) => void toggleReaction(reaction)}
            showCounts
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSheet('report')}
            className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
          >
            Laporkan
          </button>
          {!post.isOwn ? (
            <button
              type="button"
              onClick={() => setSheet('block')}
              className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
            >
              Blokir penulisnya
            </button>
          ) : null}
        </div>
      </article>

      {/*
       * Below the content, never over it. The prompt asks about something the
       * person is in the middle of reading; covering it to ask would be the
       * fastest way to make the answer meaningless.
       */}
      {prompt ? (
        <div className="mt-8">
          <FeltHeardSheet
            onAnswer={(answer) => void answerPrompt(answer)}
            onDismiss={() => void dismissPrompt()}
          />
        </div>
      ) : null}

      <section aria-labelledby="comments-heading" className="mt-10">
        <h2 id="comments-heading" className="text-lg font-bold text-[var(--color-text)]">
          Balasan
        </h2>

        {comments.length === 0 ? (
          <div className="mt-4">
            <EmptyState context="comments" />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {comments.map((comment) => (
              <li key={comment.id}>
                <CommentItem
                  commentId={comment.id}
                  authorLabel={comment.authorAlias}
                  body={comment.body}
                  createdAtLabel={relativeTime(comment.createdAt)}
                  isHelpful={comment.isMarkedHelpful}
                  // Only the post's author may mark a reply helpful (PRD §9).
                  canMarkHelpful={post.isOwn && !comment.isOwn}
                  onMarkHelpful={(id) => void markHelpful(id)}
                  replies={comment.replies.map((reply) => ({
                    commentId: reply.id,
                    authorLabel: reply.authorAlias,
                    body: reply.body,
                    createdAtLabel: relativeTime(reply.createdAt),
                    isHelpful: reply.isMarkedHelpful,
                    canMarkHelpful: post.isOwn && !reply.isOwn,
                    onMarkHelpful: (id: string) => void markHelpful(id),
                    depth: 1 as const,
                  }))}
                />
                {post.allowComments ? (
                  <button
                    type="button"
                    onClick={() => setReplyTo(comment.id)}
                    className="mt-1 min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
                  >
                    Balas
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {post.allowComments ? (
          <div className="mt-6">
            <label
              htmlFor="comment-body"
              className="block text-sm font-semibold text-[var(--color-text)]"
            >
              {replyTo ? 'Balas komentar ini' : 'Tulis balasan'}
            </label>
            <textarea
              id="comment-body"
              rows={4}
              value={composer}
              maxLength={2000}
              onChange={(event) => setComposer(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
            />

            {composerHints.length > 0 ? (
              <div role="status" className="mt-2 text-sm">
                <p className="font-semibold text-[var(--color-text)]">{PERSONAL_DATA_WARNING}</p>
                <label className="mt-2 flex min-h-[var(--size-touch)] items-center gap-3 text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={composerAck}
                    onChange={(event) => setComposerAck(event.target.checked)}
                    className="size-5"
                  />
                  <span>Aku ngerti, dan tetap mau kirim.</span>
                </label>
              </div>
            ) : null}

            <div className="mt-3 flex gap-3">
              <button
                type="button"
                disabled={sending || composer.trim().length < 2}
                onClick={() => void sendComment()}
                className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
              >
                {sending ? 'Lagi dikirim…' : 'Kirim balasan'}
              </button>
              {replyTo ? (
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
                >
                  Batal balas
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
            Penulisnya menutup balasan buat curhat ini. Kamu masih bisa kasih reaksi.
          </p>
        )}

        <p role="alert" aria-live="polite" className="mt-3 min-h-5 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      </section>

      {sheet === 'report' ? (
        <div className="mt-8">
          <ReportSheet
            onSubmit={(category, note) => {
              void (async () => {
                try {
                  await api('/reports', {
                    method: 'POST',
                    body: {
                      targetType: 'post',
                      targetId: post.id,
                      category,
                      ...(note ? { note } : {}),
                    },
                  });
                } finally {
                  setSheet('none');
                }
              })();
            }}
            onClose={() => setSheet('none')}
          />
        </div>
      ) : null}

      {sheet === 'block' ? (
        <div className="mt-8">
          <BlockDialog
            alias={post.authorAlias}
            onConfirm={() => {
              void (async () => {
                try {
                  await api(`/users/${post.authorAlias}/block`, { method: 'POST', body: {} });
                  router.push('/home');
                } finally {
                  setSheet('none');
                }
              })();
            }}
            onCancel={() => setSheet('none')}
          />
        </div>
      ) : null}
    </main>
  );
}
