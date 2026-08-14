import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Body, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../../components/ui';

/**
 * Settings — E16-T10. DESIGN-REF §2.16.
 *
 * Safety and account notifications have no toggle: they are how somebody learns
 * their post was held or their appeal was decided, and opting out of those is
 * opting out of the messages that matter most.
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

const ALWAYS_ON: readonly NotificationType[] = ['safety', 'account'];

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useSession();
  const [toggles, setToggles] = useState<Partial<Record<NotificationType, { push: boolean; inApp: boolean }>>>({});

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<{ perTypeToggles: typeof toggles }>('/me/notification-settings');
        setToggles(data.perTypeToggles ?? {});
      } catch {
        setToggles({});
      }
    })();
  }, []);

  const toggle = useCallback(
    async (type: NotificationType, value: boolean) => {
      const next = { push: value, inApp: value };
      setToggles((current) => ({ ...current, [type]: next }));
      try {
        // Only the changed type — sending the whole set back is how a stale
        // screen reverts a setting changed on another device.
        await api('/me/notification-settings', {
          method: 'PATCH',
          body: { perTypeToggles: { [type]: next } },
        });
      } catch {
        /* the next load will show the server's truth */
      }
    },
    [],
  );

  return (
    <ScreenScroll>
      <Heading>Pengaturan</Heading>

      <Text accessibilityRole="header" className="text-lg font-bold text-text">
        Notifikasi
      </Text>

      {(Object.keys(TYPE_LABELS) as NotificationType[]).map((type) => {
        const locked = ALWAYS_ON.includes(type);
        const value = toggles[type] ?? { push: true, inApp: true };

        return (
          <View key={type} className="rounded-curhat bg-surface p-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-bold text-text">{TYPE_LABELS[type]}</Text>
              {locked ? null : (
                <Switch
                  accessibilityLabel={TYPE_LABELS[type]}
                  value={value.push}
                  onValueChange={(next) => void toggle(type, next)}
                />
              )}
            </View>
            {locked ? (
              <Text className="mt-1 text-sm text-muted">
                Selalu aktif — ini cara kami ngasih tahu hal penting soal akun dan keamananmu.
              </Text>
            ) : null}
          </View>
        );
      })}

      <Text accessibilityRole="header" className="mt-4 text-lg font-bold text-text">
        Lainnya
      </Text>
      <SecondaryButton label="Data & privasi" onPress={() => router.push('/settings/data')} />
      <SecondaryButton
        label="Riwayat moderasi & banding"
        onPress={() => router.push('/moderation/actions')}
      />

      <Body muted>Tema ikut sistem, dan otomatis jadi Midnight Mode jam 21.00–04.00.</Body>

      <PrimaryButton label="Keluar" onPress={() => void signOut()} />
      <SecondaryButton
        label="Keluar dari semua perangkat"
        onPress={() => {
          void api('/auth/logout-all', { method: 'POST', body: {} })
            .catch(() => undefined)
            .finally(() => void signOut());
        }}
      />
    </ScreenScroll>
  );
}
