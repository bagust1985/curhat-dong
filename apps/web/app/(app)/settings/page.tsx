'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api';
import { useSession } from '../../../lib/session';

/**
 * `/settings` — E15-T16. DESIGN-REF §2.16.
 *
 * Account, notifications and theme. The heavier things — consent, export and
 * deletion — live at `/settings/data`, because they deserve a screen where
 * nothing else is competing for attention.
 */

type NotificationType = 'social' | 'response' | 'listener' | 'ai' | 'safety' | 'account';

const TYPE_LABELS: Record<NotificationType, string> = {
  social: 'Ada yang baca ceritamu',
  response: 'Ada yang membalas',
  listener: 'Ajakan jadi pendengar',
  ai: 'Pengingat DONG AI',
  safety: 'Keamanan akun & konten',
  account: 'Hal-hal soal akunmu',
};

/**
 * Safety notifications cannot be turned off.
 *
 * They are how somebody learns their post was held, their appeal was decided,
 * or their account is at risk. Making that optional would let a person opt out
 * of the messages they most need.
 */
const ALWAYS_ON: readonly NotificationType[] = ['safety', 'account'];

interface NotificationSettings {
  perTypeToggles: Partial<Record<NotificationType, { push: boolean; inApp: boolean }>>;
  quietHoursEnabled: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

type Theme = 'light' | 'dark' | 'system';

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useSession();

  const [alias, setAlias] = useState('');
  const [bio, setBio] = useState('');
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [theme, setTheme] = useState<Theme>('system');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setAlias(user.alias);
    setBio(user.bio ?? '');
  }, [user]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('curhat-theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored);
    } catch {
      /* storage disabled */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<NotificationSettings>('/me/notification-settings');
        setSettings(data);
      } catch {
        setSettings(null);
      }
    })();
  }, []);

  const saveProfile = useCallback(async () => {
    try {
      await api('/me', { method: 'PATCH', body: { alias: alias.trim(), bio: bio.trim() } });
      setNotice('Kesimpan.');
    } catch {
      setNotice('Belum kesimpan. Coba lagi ya.');
    }
  }, [alias, bio]);

  const toggle = useCallback(
    async (type: NotificationType, channel: 'push' | 'inApp', value: boolean) => {
      const current = settings?.perTypeToggles[type] ?? { push: true, inApp: true };
      const next = { ...current, [channel]: value };

      setSettings((state) =>
        state
          ? { ...state, perTypeToggles: { ...state.perTypeToggles, [type]: next } }
          : state,
      );

      try {
        // Only the changed type is sent — the API merges (users.dto.ts), and
        // sending the whole set back is how a stale screen reverts a toggle
        // somebody changed on another device.
        await api('/me/notification-settings', {
          method: 'PATCH',
          body: { perTypeToggles: { [type]: next } },
        });
      } catch {
        setNotice('Pengaturannya belum kesimpan. Coba lagi ya.');
      }
    },
    [settings],
  );

  const applyTheme = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem('curhat-theme', next);
    } catch {
      /* storage disabled */
    }
    // `system` clears the attribute so Midnight Mode and the OS preference can
    // take over again (ThemeScript).
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Pengaturan</h1>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-[var(--color-muted)]">
        {notice}
      </p>

      <section aria-labelledby="account-heading" className="mt-6">
        <h2 id="account-heading" className="text-lg font-bold text-[var(--color-text)]">
          Akun
        </h2>

        <label htmlFor="settings-alias" className="mt-3 block text-sm font-semibold text-[var(--color-text)]">
          Nama samaran
        </label>
        <input
          id="settings-alias"
          value={alias}
          maxLength={24}
          onChange={(event) => setAlias(event.target.value)}
          className="mt-1 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />

        <label htmlFor="settings-bio" className="mt-3 block text-sm font-semibold text-[var(--color-text)]">
          Bio
        </label>
        <textarea
          id="settings-bio"
          value={bio}
          rows={3}
          maxLength={280}
          onChange={(event) => setBio(event.target.value)}
          className="mt-1 w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
        />

        <button
          type="button"
          onClick={() => void saveProfile()}
          className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
        >
          Simpan
        </button>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void signOut().then(() => router.push('/'))}
            className="min-h-[var(--size-touch)] text-sm text-[var(--color-text)] underline underline-offset-4"
          >
            Keluar
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await api('/auth/logout-all', { method: 'POST', body: {} });
                } finally {
                  await signOut();
                  router.push('/');
                }
              })();
            }}
            className="min-h-[var(--size-touch)] text-sm text-[var(--color-text)] underline underline-offset-4"
          >
            Keluar dari semua perangkat
          </button>
        </div>
      </section>

      <section aria-labelledby="notif-heading" className="mt-10">
        <h2 id="notif-heading" className="text-lg font-bold text-[var(--color-text)]">
          Notifikasi
        </h2>

        <ul className="mt-3 flex flex-col gap-3">
          {(Object.keys(TYPE_LABELS) as NotificationType[]).map((type) => {
            const value = settings?.perTypeToggles[type] ?? { push: true, inApp: true };
            const locked = ALWAYS_ON.includes(type);

            return (
              <li
                key={type}
                className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <p className="font-semibold text-[var(--color-text)]">{TYPE_LABELS[type]}</p>
                {locked ? (
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    Selalu aktif — ini cara kami ngasih tahu hal penting soal akun dan keamananmu.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(['push', 'inApp'] as const).map((channel) => (
                      <label
                        key={channel}
                        className="flex min-h-[var(--size-touch)] items-center gap-2 text-sm text-[var(--color-text)]"
                      >
                        <input
                          type="checkbox"
                          checked={value[channel]}
                          onChange={(event) => void toggle(type, channel, event.target.checked)}
                          className="size-5"
                        />
                        <span>{channel === 'push' ? 'Push' : 'Di dalam app'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="theme-heading" className="mt-10">
        <h2 id="theme-heading" className="text-lg font-bold text-[var(--color-text)]">
          Tampilan
        </h2>
        <div role="radiogroup" aria-label="Tema" className="mt-3 flex gap-2">
          {(
            [
              ['system', 'Ikut sistem'],
              ['light', 'Terang'],
              ['dark', 'Gelap'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => applyTheme(value)}
              className={`min-h-[var(--size-touch)] rounded-[var(--radius-chip)] border px-4 text-sm ${
                theme === value
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)] font-semibold text-[var(--color-text)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          "Ikut sistem" juga yang bikin Midnight Mode nyala sendiri jam 21.00–04.00.
        </p>
      </section>

      <section aria-labelledby="more-heading" className="mt-10">
        <h2 id="more-heading" className="text-lg font-bold text-[var(--color-text)]">
          Data, privasi & lainnya
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          <li>
            <a
              href="/settings/data"
              className="inline-flex min-h-[var(--size-touch)] items-center text-[var(--color-text)] underline underline-offset-4"
            >
              Data & privasi
            </a>
          </li>
          <li>
            <a
              href="/moderation/actions"
              className="inline-flex min-h-[var(--size-touch)] items-center text-[var(--color-text)] underline underline-offset-4"
            >
              Riwayat moderasi & banding
            </a>
          </li>
          <li>
            <a
              href="/legal/privacy"
              className="inline-flex min-h-[var(--size-touch)] items-center text-[var(--color-text)] underline underline-offset-4"
            >
              Kebijakan Privasi
            </a>
          </li>
          <li>
            <a
              href="/legal/terms"
              className="inline-flex min-h-[var(--size-touch)] items-center text-[var(--color-text)] underline underline-offset-4"
            >
              Syarat & Ketentuan
            </a>
          </li>
          <li>
            <a
              href="/legal/guidelines"
              className="inline-flex min-h-[var(--size-touch)] items-center text-[var(--color-text)] underline underline-offset-4"
            >
              Panduan Komunitas
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
