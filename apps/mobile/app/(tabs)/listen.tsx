import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ApiError, api } from '../../lib/api';
import { Body, ErrorText, Heading, Loading, PrimaryButton, SecondaryButton } from '../../components/ui';

/**
 * Listen — E16-T08. DESIGN-REF §2.9, §2.20, PRD §11, §12.
 *
 * Guidelines gate, availability, offers and rest states, same rules as the web:
 * the guidelines must be scrolled to the end, the offer shows the need and not
 * the person, and a rest state has no "continue anyway".
 *
 * The offer countdown is computed from `expiresAt` rather than counted down
 * from 60, because on mobile the screen may be opened from a notification
 * several seconds after the offer was made (E16-T08).
 */

interface GuidelineSection {
  title: string;
  body: string;
}

interface ListenerProfile {
  isAvailable: boolean;
  needsGuidelinesAcceptance: boolean;
}

interface Offer {
  matchId: string;
  topic: string;
  emotion: string;
  mood: string | null;
  expiresAt: string;
}

interface Burnout {
  dailyCapReached: boolean;
  cooldownUntil: string | null;
  restReminder: boolean;
  message: string | null;
}

export default function ListenScreen() {
  const router = useRouter();

  const [guidelines, setGuidelines] = useState<{ version: string; sections: GuidelineSection[] } | null>(null);
  const [profile, setProfile] = useState<ListenerProfile | null>(null);
  const [burnout, setBurnout] = useState<Burnout | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [readToEnd, setReadToEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const polling = useRef(false);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api<ListenerProfile>('/listener/profile');
      setProfile(data);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) setProfile(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<{ version: string; sections: GuidelineSection[] }>(
          '/listener/guidelines',
        );
        setGuidelines(data);
      } catch {
        setError('Panduannya belum bisa dimuat.');
      }
      await loadProfile();
    })();
  }, [loadProfile]);

  useEffect(() => {
    if (!profile || profile.needsGuidelinesAcceptance) return;
    void (async () => {
      try {
        const { data } = await api<{ burnout: Burnout }>('/listener/stats');
        setBurnout(data.burnout);
      } catch {
        setBurnout(null);
      }
    })();
  }, [profile]);

  useEffect(() => {
    if (!profile?.isAvailable) return;

    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const { data } = await api<Offer[]>('/listener/offers');
        setOffer(data[0] ?? null);
      } catch {
        /* a failed poll is not worth an error banner */
      } finally {
        polling.current = false;
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => clearInterval(timer);
  }, [profile?.isAvailable]);

  // Recomputed from the deadline every second: opening the app from a
  // notification 20 seconds late must not show a fresh 60.
  useEffect(() => {
    if (!offer) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setOffer(null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [offer]);

  const activate = useCallback(async () => {
    if (!guidelines) return;
    try {
      await api('/listener/activate', {
        method: 'POST',
        body: { guidelinesVersion: guidelines.version },
      });
      await loadProfile();
    } catch {
      setError('Belum bisa diaktifkan. Coba lagi sebentar lagi ya.');
    }
  }, [guidelines, loadProfile]);

  const accept = useCallback(async (matchId: string) => {
    setOffer(null);
    try {
      const { data } = await api<{ roomId: string }>(`/listener/matches/${matchId}/accept`, {
        method: 'POST',
        body: {},
      });
      router.push(`/room/${data.roomId}`);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'MATCH_OFFER_ALREADY_TAKEN'
          ? 'Udah ada yang duluan nemenin. Makasih ya udah mau.'
          : 'Tawarannya keburu lewat. Nggak apa-apa — nanti ada lagi.',
      );
    }
  }, [router]);

  if (!loaded) return <Loading label="Sebentar ya…" />;

  if (!profile || profile.needsGuidelinesAcceptance) {
    return (
      <View className="flex-1 bg-bg px-gutter py-6">
        <Heading>Sebelum jadi listener</Heading>
        <Body muted>Baca sampai habis ya. Ini yang bikin ruang di sini aman.</Body>

        <ScrollView
          accessibilityLabel="Panduan listener"
          className="my-4 max-h-96 rounded-curhat border border-border bg-surface p-4"
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 8) {
              setReadToEnd(true);
            }
          }}
          scrollEventThrottle={16}
        >
          {(guidelines?.sections ?? []).map((section) => (
            <View key={section.title} className="mb-4">
              <Text className="text-base font-semibold text-text">{section.title}</Text>
              <Text className="mt-1 text-sm leading-5 text-muted">{section.body}</Text>
            </View>
          ))}
        </ScrollView>

        <Text className="mb-3 text-sm text-muted">
          {readToEnd ? 'Makasih udah baca sampai habis.' : 'Scroll sampai bawah dulu ya.'}
        </Text>

        <PrimaryButton
          label="Aku ngerti dan siap dengerin"
          disabled={!readToEnd}
          onPress={() => void activate()}
        />
        <ErrorText message={error} />
      </View>
    );
  }

  const resting =
    burnout?.dailyCapReached === true || burnout?.cooldownUntil !== null || burnout?.restReminder === true;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="px-gutter py-6 gap-4">
      <Heading>Mode dengerin</Heading>

      {offer ? (
        <View
          accessibilityViewIsModal
          className="rounded-curhat border border-border bg-surface p-4"
        >
          <Text accessibilityRole="header" className="text-base font-semibold text-text">
            Ada yang butuh didengar
          </Text>
          {/* Topic, emotion and mood. Nothing that identifies anyone. */}
          <Text className="mt-2 text-sm text-text">Topik: {offer.topic}</Text>
          <Text className="text-sm text-text">Yang dirasain: {offer.emotion}</Text>
          <Text className="mt-2 text-sm text-muted">
            Tawaran ini berlaku {secondsLeft} detik lagi.
          </Text>
          <View className="mt-4 gap-2">
            <PrimaryButton label="Aku siap dengerin" onPress={() => void accept(offer.matchId)} />
            <SecondaryButton label="Lagi nggak bisa" onPress={() => setOffer(null)} />
          </View>
        </View>
      ) : null}

      {resting ? (
        <View className="rounded-curhat border border-border bg-surface-alt p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-text">
            {burnout?.dailyCapReached ? 'Hari ini kamu udah cukup 🤍' : 'Istirahat dulu sebentar'}
          </Text>
          <Text className="mt-1 text-sm text-text">
            {burnout?.message ??
              'Kamu udah nemenin beberapa orang. Balik lagi kalau kamu udah pulih — nggak ada yang ngitungin.'}
          </Text>
          {/* No "continue anyway": a cap with an override is decoration. */}
        </View>
      ) : null}

      <ErrorText message={error} />
    </ScrollView>
  );
}
