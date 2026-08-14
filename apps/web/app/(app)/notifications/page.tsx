'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api';
import { relativeTime } from '../../../lib/relative-time';
import { EmptyState } from '../../../components/conversation';

/**
 * `/notifications` — E15-T15. DESIGN-REF §2.14, PRD §14.
 *
 * CLAUDE.md non-negotiable #3: a notification never carries the content of a
 * curhat, a chat, or an AI conversation. The API enforces that — `title` and
 * `body` come from a closed set of templates and `NotificationPayload` has no
 * free-text field at all (E01, E12).
 *
 * This page's job is to not undo that. It renders exactly what the API sent and
 * never fetches the target to "enrich" a row with a preview, which is the
 * obvious-looking change that would break the rule.
 */

interface NotificationRow {
  id: string;
  type: string;
  template: string;
  title: string;
  body: string;
  targetId: string | null;
  deepLink: string;
  targetAvailable: boolean;
  unavailableMessage?: string;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api<{ items: NotificationRow[] }>('/notifications');
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

      // A dead deep link is worse than none: the API already told us the target
      // is gone (E12-T07), so stay put and show its note instead.
      if (row.targetAvailable) router.push(row.deepLink);
    },
    [router],
  );

  const markAllRead = useCallback(async () => {
    setItems((current) =>
      current.map((entry) => ({ ...entry, readAt: entry.readAt ?? new Date().toISOString() })),
    );
    try {
      await api('/notifications/read', { method: 'POST', body: {} });
    } catch {
      /* best effort */
    }
  }, []);

  const unread = items.filter((item) => item.readAt === null).length;

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[27px] font-black text-[var(--color-text)]">Notifikasi</h1>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
          >
            Tandai udah dibaca
          </button>
        ) : null}
      </div>

      <p className="mt-4">
        <a
          href="/settings"
          className="text-sm text-[var(--color-text)] underline underline-offset-4"
        >
          Atur notifikasi
        </a>
      </p>

      {loaded && items.length === 0 ? (
        <div className="mt-6">
          <EmptyState context="notifications" />
        </div>
      ) : null}

      <ul className="mt-6 flex flex-col gap-2">
        {items.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => void open(row)}
              aria-label={`${row.title}. ${row.readAt === null ? 'Belum dibaca.' : ''}`}
              // Unread carries three signals, not one: the tint, the dot, and
              // the bold title — plus "Belum dibaca" in the accessible name.
              // A colour-only unread state is invisible to a good chunk of the
              // people this product exists for.
              className={`min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border p-4 text-left shadow-[var(--shadow-card)] ${
                row.readAt === null
                  ? 'border-[var(--color-primary)] bg-[var(--color-tint-pink)]'
                  : 'border-transparent bg-[var(--color-surface)]'
              }`}
            >
              <span className="flex items-center gap-2">
                {row.readAt === null ? (
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full bg-[var(--color-primary)]"
                  />
                ) : null}
                <span
                  className={`text-[var(--color-text)] ${
                    row.readAt === null ? 'font-black' : 'font-semibold'
                  }`}
                >
                  {row.title}
                </span>
              </span>
              <span className="mt-1 block text-sm text-[var(--color-muted)]">{row.body}</span>
              <span className="mt-1 block text-xs text-[var(--color-muted)]">
                {relativeTime(row.createdAt)}
              </span>

              {!row.targetAvailable ? (
                <span className="mt-2 block text-sm text-[var(--color-muted)]">
                  {row.unavailableMessage ?? 'Yang ditunjuk notifikasi ini udah nggak ada.'}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
