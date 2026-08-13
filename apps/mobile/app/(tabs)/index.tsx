import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { NetworkError, api } from '../../lib/api';
import { mergePages, toCardData, type FeedApiItem } from '../../lib/feed';
import { useSession } from '../../lib/session';
import { feedGreeting } from '../../lib/theme';
import { CurhatCard, EmptyState, Loading, SecondaryButton } from '../../components/ui';
import { OfflineBanner } from '../../components/status-screens';
import { EMPTY_STATES } from '@curhat/types';

/**
 * Home feed — E16-T05. DESIGN-REF §2.4, PRD §6.
 *
 * `FlatList` with `onEndReached` rather than the web's IntersectionObserver, and
 * a real pull-to-refresh: on mobile the gesture is the platform's own idiom, so
 * unlike the web (where the browser already owns it) implementing it here is the
 * correct call.
 *
 * The same duplicate protection as the web, for the same reason: an in-flight
 * guard plus `mergePages`, because a fast flick fires `onEndReached` repeatedly.
 */

const TABS = [
  { key: 'untuk-kamu', label: 'Untuk Kamu', empty: 'untukKamu' },
  { key: 'terbaru', label: 'Terbaru', empty: 'feed' },
  { key: 'butuh-didengar', label: 'Butuh Didengar', empty: 'butuhDidengar' },
  { key: 'topik', label: 'Topik', empty: 'feed' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [tab, setTab] = useState<TabKey>('terbaru');
  const [items, setItems] = useState<FeedApiItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const inFlight = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<Array<{ slug: string; name: string }>>('/categories');
        setCategories(Object.fromEntries(data.map((entry) => [entry.slug, entry.name])));
      } catch {
        /* slugs are shown instead */
      }
    })();
  }, []);

  const load = useCallback(
    async (key: TabKey, mode: 'first' | 'more' | 'refresh') => {
      if (inFlight.current) return;
      if (mode === 'more' && !cursor) return;

      inFlight.current = true;
      setLoading(true);
      try {
        const { data } = await api<{ items: FeedApiItem[]; nextCursor: string | null }>('/feed', {
          query: { tab: key, limit: 20, ...(mode === 'more' && cursor ? { cursor } : {}) },
        });
        setItems((current) => (mode === 'more' ? mergePages(current, data.items) : data.items));
        setCursor(data.nextCursor);
        setOffline(false);
      } catch (error) {
        setOffline(error instanceof NetworkError);
      } finally {
        setLoading(false);
        setLoaded(true);
        inFlight.current = false;
      }
    },
    [cursor],
  );

  // Reloads when the tab changes, and only then. `load` closes over the cursor,
  // so depending on it would refetch page one every time a page lands.
  const loadedTab = useRef<TabKey | null>(null);
  useEffect(() => {
    if (loadedTab.current === tab) return;
    loadedTab.current = tab;
    setItems([]);
    setCursor(null);
    setLoaded(false);
    void load(tab, 'first');
  }, [load, tab]);

  const emptyKey = TABS.find((entry) => entry.key === tab)?.empty ?? 'feed';
  const empty = EMPTY_STATES[emptyKey];

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-gutter pb-32 pt-6 gap-4"
        refreshControl={
          <RefreshControl refreshing={loading && loaded} onRefresh={() => void load(tab, 'refresh')} />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => void load(tab, 'more')}
        ListHeaderComponent={
          <View className="gap-4 pb-2">
            <Text accessibilityRole="header" className="text-xl font-bold text-text">
              {feedGreeting(new Date())}
            </Text>

            <View className="flex-row flex-wrap gap-2">
              {TABS.map((entry) => (
                <Text
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab === entry.key }}
                  onPress={() => setTab(entry.key)}
                  className={`rounded-chip border px-4 py-2 text-sm ${
                    tab === entry.key
                      ? 'border-primary bg-surface-alt font-semibold text-text'
                      : 'border-border bg-surface text-muted'
                  }`}
                >
                  {entry.label}
                </Text>
              ))}
            </View>

            <View className="rounded-curhat border border-border bg-surface-alt p-4">
              <Text accessibilityRole="header" className="text-base font-semibold text-text">
                Lagi pengen cerita tapi belum siap ngomong ke orang?
              </Text>
              <Text className="mt-1 text-sm text-muted">
                DONG AI bisa nemenin dulu. Dia AI — bukan psikolog.
              </Text>
              <View className="mt-3">
                <SecondaryButton label="Ngobrol sama DONG AI" onPress={() => router.push('/ai')} />
              </View>
            </View>

            {user?.isListener ? (
              <View className="rounded-curhat border border-l-4 border-border border-l-accent-amber bg-surface p-4">
                <Text accessibilityRole="header" className="text-base font-semibold text-text">
                  Ada orang yang sedang butuh didengar.
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  Kalau kamu lagi punya tenaga. Kalau nggak, nggak apa-apa juga.
                </Text>
              </View>
            ) : null}

            {offline ? <OfflineBanner onRetry={() => void load(tab, 'refresh')} /> : null}
          </View>
        }
        ListEmptyComponent={
          loaded && !loading ? (
            <EmptyState
              title={empty.title}
              body={empty.body}
              actionLabel={empty.action}
              onAction={() => router.push('/curhat/baru')}
            />
          ) : (
            <Loading label="Lagi memuat cerita…" />
          )
        }
        renderItem={({ item }) => (
          <CurhatCard
            {...toCardData(item, categories)}
            onOpen={(id) => router.push(`/post/${id}`)}
          />
        )}
      />
    </View>
  );
}
