import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { api } from '../lib/api';
import { relativeTime } from '../lib/relative-time';
import { resolveDeepLink } from '../lib/navigation';
import { EmptyState, Heading, ScreenScroll } from '../components/ui';
import { TOUCH_TARGET } from '../lib/tokens';

/**
 * Notifications — E16-T09. DESIGN-REF §2.14, CLAUDE.md non-negotiable #3.
 *
 * Renders what the API sent and fetches nothing else. Pulling the target in to
 * show a preview is the change that would break the rule, and it would land on
 * a lock screen before anyone noticed.
 *
 * Deep links go through `resolveDeepLink`: a path arriving from outside the app
 * must not be able to steer navigation anywhere it likes.
 */

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  deepLink: string;
  targetAvailable: boolean;
  unavailableMessage?: string;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<{ items: NotificationRow[] }>('/notifications');
        setItems(data.items);
      } catch {
        setItems([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const open = useCallback(
    async (row: NotificationRow) => {
      setItems((current) =>
        current.map((entry) =>
          entry.id === row.id ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
      try {
        await api('/notifications/read', { method: 'POST', body: { ids: [row.id] } });
      } catch {
        /* marking read is not worth interrupting the tap */
      }
      if (row.targetAvailable) router.push(resolveDeepLink(row.deepLink));
    },
    [router],
  );

  return (
    <ScreenScroll>
      <Heading>Notifikasi</Heading>

      {loaded && items.length === 0 ? (
        <EmptyState
          title="Belum ada notifikasi."
          body="Nanti kalau ada yang membalas ceritamu, muncul di sini."
        />
      ) : null}

      {items.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={`${row.title}. ${row.readAt === null ? 'Belum dibaca.' : ''}`}
          onPress={() => void open(row)}
          style={{ minHeight: TOUCH_TARGET }}
          className={`rounded-curhat border p-4 ${
            row.readAt === null ? 'border-primary bg-tint-pink' : 'border-border bg-surface'
          }`}
        >
          <Text accessibilityElementsHidden className="font-bold text-text">
            {row.title}
          </Text>
          <Text accessibilityElementsHidden className="mt-1 text-sm text-muted">
            {row.body}
          </Text>
          <Text accessibilityElementsHidden className="mt-1 text-xs text-muted">
            {relativeTime(row.createdAt)}
          </Text>
          {!row.targetAvailable ? (
            <Text className="mt-2 text-sm text-muted">
              {row.unavailableMessage ?? 'Yang ditunjuk notifikasi ini udah nggak ada.'}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScreenScroll>
  );
}
