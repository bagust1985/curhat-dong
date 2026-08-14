import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { api } from '../../lib/api';
import { EmptyState, Heading, Loading, ScreenScroll } from '../../components/ui';
import { TOUCH_TARGET } from '../../lib/tokens';

/**
 * Explore — E16-T05. DESIGN-REF §2.12.
 *
 * The active-curhat count is the one number worth showing: it answers "will
 * anyone read me if I post here", which is the question somebody actually has
 * when choosing a topic.
 */

interface Topic {
  slug: string;
  name: string;
  icon: string | null;
  activePosts: number;
}

export default function ExploreScreen() {
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

  if (!loaded) return <Loading label="Lagi memuat topik…" />;

  return (
    <ScreenScroll>
      <Heading>Topik</Heading>

      {topics.length === 0 ? (
        <EmptyState
          title="Belum ada topik yang bisa dimuat."
          body="Coba lagi sebentar lagi ya."
        />
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        {topics.map((topic) => (
          <Pressable
            key={topic.slug}
            accessibilityRole="button"
            accessibilityLabel={`${topic.name}, ${topic.activePosts} cerita aktif`}
            onPress={() => router.push('/')}
            style={{ minHeight: TOUCH_TARGET, width: '47%' }}
            className="rounded-curhat bg-surface p-4"
          >
            <Text accessibilityElementsHidden className="text-lg">
              {topic.icon ?? '💬'}
            </Text>
            <Text accessibilityElementsHidden className="mt-1 font-bold text-text">
              {topic.name}
            </Text>
            <Text accessibilityElementsHidden className="text-sm text-muted">
              {topic.activePosts === 0 ? 'Belum ada cerita' : `${topic.activePosts} cerita aktif`}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScreenScroll>
  );
}
