import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ApiError, api } from '../../lib/api';
import { toIntent, toMood } from '../../lib/feed';
import { relativeTime } from '../../lib/relative-time';
import { PERSONAL_DATA_WARNING, detectPersonalData } from '../../lib/personal-data';
import {
  Body,
  ErrorText,
  Heading,
  IntentBadge,
  Loading,
  MoodChip,
  PrimaryButton,
  ReactionBar,
  ScreenScroll,
} from '../../components/ui';
import type { Reaction } from '@curhat/types';

/**
 * Post detail — E16-T05. DESIGN-REF §2.5, PRD §9.
 *
 * Held, deleted and never-existed render as one screen for anyone but the
 * author: telling them apart would leak that somebody wrote something a safety
 * check flagged.
 */

interface PostDetail {
  id: string;
  title: string | null;
  body: string;
  mood: string;
  intent: string;
  categoryName: string;
  authorAlias: string;
  allowComments: boolean;
  reactionCounts: Record<string, number>;
  createdAt: string;
  isOwn: boolean;
  status?: string;
}

interface CommentNode {
  id: string;
  body: string;
  authorAlias: string;
  isMarkedHelpful: boolean;
  createdAt: string;
}

export default function PostDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [missing, setMissing] = useState(false);
  const [mine, setMine] = useState<Reaction[]>([]);
  const [composer, setComposer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api<PostDetail>(`/posts/${id}`);
      setPost(data);
      const { data: page } = await api<{ items: CommentNode[] }>(`/posts/${id}/comments`);
      setComments(page.items);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 404 || cause.code === 'POST_HELD_FOR_REVIEW')) {
        setMissing(true);
      } else {
        setError('Curhatnya belum bisa dimuat. Coba lagi sebentar lagi ya.');
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(async () => {
    if (composer.trim().length < 2) return;
    try {
      await api(`/posts/${id}/comments`, { method: 'POST', body: { body: composer.trim() } });
      setComposer('');
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'COMMENTS_LOCKED'
          ? 'Balasan buat curhat ini udah ditutup.'
          : 'Balasanmu belum kekirim. Coba lagi ya.',
      );
    }
  }, [composer, id, load]);

  if (missing) {
    return (
      <ScreenScroll>
        <Heading>Curhatnya udah nggak ada</Heading>
        <Body muted>Mungkin dihapus penulisnya, atau memang nggak pernah ada.</Body>
        <PrimaryButton label="Balik ke beranda" onPress={() => router.replace('/')} />
      </ScreenScroll>
    );
  }

  if (!post) return <Loading label="Lagi memuat curhat…" />;

  const hints = detectPersonalData(composer);

  return (
    <ScreenScroll>
      {post.status === 'held' ? (
        <View className="rounded-curhat border border-dashed border-muted p-4">
          <Text className="text-sm font-bold text-text">
            Curhatmu kami tinjau dulu sebentar ya
          </Text>
          <Text className="mt-1 text-sm text-muted">
            Baru kamu yang bisa lihat ini. Ini bukan hukuman.
          </Text>
        </View>
      ) : null}

      <Text className="text-sm text-muted">
        {post.authorAlias} · {post.categoryName} · {relativeTime(post.createdAt)}
      </Text>
      <Heading>{post.title ?? 'Curhat'}</Heading>
      <Body>{post.body}</Body>

      <View className="flex-row flex-wrap gap-2">
        <MoodChip mood={toMood(post.mood)} />
        <IntentBadge intent={toIntent(post.intent)} />
      </View>

      <ReactionBar
        counts={post.reactionCounts as Partial<Record<Reaction, number>>}
        mine={mine}
        showCounts
        onToggle={(reaction) => {
          const given = mine.includes(reaction);
          setMine((current) =>
            given ? current.filter((entry) => entry !== reaction) : [...current, reaction],
          );
          void api(
            given ? `/posts/${id}/reactions/${reaction}` : `/posts/${id}/reactions`,
            given ? { method: 'DELETE' } : { method: 'PUT', body: { type: reaction } },
          ).catch(() => setMine((current) => (given ? [...current, reaction] : current.filter((e) => e !== reaction))));
        }}
      />

      <Text accessibilityRole="header" className="mt-4 text-lg font-bold text-text">
        Balasan
      </Text>

      {comments.length === 0 ? (
        <Body muted>Belum ada yang balas. Kadang butuh waktu.</Body>
      ) : (
        comments.map((comment) => (
          <View key={comment.id} className="rounded-curhat bg-surface p-3">
            <Text className="text-sm text-muted">
              {comment.authorAlias} · {relativeTime(comment.createdAt)}
            </Text>
            <Text className="mt-1 text-sm text-text">{comment.body}</Text>
            {comment.isMarkedHelpful ? (
              <Text className="mt-1 text-sm text-text">Jawaban ini membantu gue 🤍</Text>
            ) : null}
          </View>
        ))
      )}

      {post.allowComments ? (
        <>
          <Text className="text-sm font-bold text-text">Tulis balasan</Text>
          <TextInput
            accessibilityLabel="Tulis balasan"
            value={composer}
            onChangeText={setComposer}
            multiline
            numberOfLines={3}
            maxLength={2000}
            className="min-h-20 rounded-curhat bg-surface p-3 text-text"
          />
          {hints.length > 0 ? (
            <Text className="text-sm font-bold text-text">{PERSONAL_DATA_WARNING}</Text>
          ) : null}
          <ErrorText message={error} />
          <PrimaryButton label="Kirim balasan" onPress={() => void send()} />
        </>
      ) : (
        <Body muted>Penulisnya menutup balasan buat curhat ini. Kamu masih bisa kasih reaksi.</Body>
      )}
    </ScreenScroll>
  );
}
