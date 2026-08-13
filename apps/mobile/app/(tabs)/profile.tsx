import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useSession } from '../../lib/session';
import { relativeTime } from '../../lib/relative-time';
import { Body, Heading, Loading, ScreenScroll, SecondaryButton } from '../../components/ui';

/**
 * Own profile — E16-T10. DESIGN-REF §2.15, PRD §16.
 *
 * Alias, avatar, joined date, helpful count. No email, no phone, no follower
 * count — the last is a decision (PRD §16), not an omission: a number beside an
 * alias turns a place to be heard into a place to be measured.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useSession();

  if (!user) return <Loading label="Lagi memuat profil…" />;

  return (
    <ScreenScroll>
      <View className="flex-row items-center gap-4">
        <Text accessibilityElementsHidden className="text-4xl">
          {user.avatar ? '🙂' : '🌙'}
        </Text>
        <View>
          <Heading>{user.alias}</Heading>
          <Text className="text-sm text-muted">Gabung {relativeTime(user.joinedAt)}</Text>
          {user.isListener ? (
            <Text className="mt-1 self-start rounded-chip border border-brand px-3 py-0.5 text-sm text-text">
              Listener
            </Text>
          ) : null}
        </View>
      </View>

      {user.bio ? <Body>{user.bio}</Body> : null}

      <Body muted>
        {user.helpfulCount === 0
          ? 'Belum ada balasan yang ditandai membantu.'
          : `${user.helpfulCount} balasan ditandai membantu sama yang cerita.`}
      </Body>

      <SecondaryButton label="Pengaturan" onPress={() => router.push('/settings')} />
      <SecondaryButton label="Data & privasi" onPress={() => router.push('/settings/data')} />
      <SecondaryButton
        label="Riwayat moderasi"
        onPress={() => router.push('/moderation/actions')}
      />
      <SecondaryButton label="Notifikasi" onPress={() => router.push('/notifications')} />
    </ScreenScroll>
  );
}
