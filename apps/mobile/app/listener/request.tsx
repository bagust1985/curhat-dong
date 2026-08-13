import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';

import { ApiError, api } from '../../lib/api';
import { maybeEnablePush } from '../../lib/push';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../../components/ui';
import { TOUCH_TARGET } from '../../lib/tokens';

/**
 * Cari listener — E16-T08. DESIGN-REF §2.10.
 *
 * The searching state promises nothing: there may be nobody awake, and a screen
 * implying success makes the failure land harder.
 */

interface RequestStatus {
  id: string;
  status: 'searching' | 'matched' | 'expired' | 'cancelled';
  roomId?: string | null;
}

export default function ListenerRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ topic?: string; emotion?: string }>();

  const [topic, setTopic] = useState(params.topic ?? '');
  const [emotion, setEmotion] = useState(params.emotion ?? '');
  const [phase, setPhase] = useState<'form' | 'searching' | 'failed'>('form');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'searching' || !requestId) return;

    const poll = async () => {
      try {
        const { data } = await api<RequestStatus>(`/listener/requests/${requestId}`);
        if (data.status === 'matched' && data.roomId) router.replace(`/room/${data.roomId}`);
        else if (data.status === 'expired' || data.status === 'cancelled') setPhase('failed');
      } catch {
        /* one failed poll is not a failed search */
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => clearInterval(timer);
  }, [phase, requestId, router]);

  const submit = useCallback(async () => {
    setError(null);
    try {
      const { data } = await api<RequestStatus>('/listener/requests', {
        method: 'POST',
        body: { topic: topic.trim(), emotion: emotion.trim() },
      });
      setRequestId(data.id);
      setPhase('searching');
      // The search can outlive the screen — "kamu boleh tutup halaman ini"
      // is only true if we can reach them afterwards.
      void maybeEnablePush('after_listener_request');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'LISTENER_REQUEST_ALREADY_ACTIVE') {
        setPhase('searching');
      } else {
        setError('Belum bisa mulai nyari. Coba lagi sebentar lagi ya.');
      }
    }
  }, [emotion, topic]);

  if (phase === 'searching') {
    return (
      <ScreenScroll>
        <Heading>Lagi nyariin orang yang tepat buat dengerin kamu…</Heading>
        <Body muted>Biasanya beberapa menit. Kadang lebih lama kalau lagi sepi.</Body>
        <Body muted>Kamu boleh tutup halaman ini — kalau ketemu, kami kabarin.</Body>
        <SecondaryButton label="Batalin pencarian" onPress={() => setPhase('form')} />
      </ScreenScroll>
    );
  }

  if (phase === 'failed') {
    return (
      <ScreenScroll>
        <Heading>Belum ada yang bisa nemenin sekarang</Heading>
        <Body muted>
          Bukan karena ceritamu nggak penting. Malam-malam gini kadang yang lagi siap dengerin
          memang lagi sedikit.
        </Body>
        <SecondaryButton label="Ngobrol sama DONG AI dulu" onPress={() => router.replace('/ai')} />
        <SecondaryButton
          label="Tulis di Butuh Didengar"
          onPress={() => router.replace('/curhat/baru')}
        />
        <SecondaryButton label="Coba cari lagi" onPress={() => setPhase('form')} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <Heading>Cari orang yang mau dengerin</Heading>
      <Body muted>Dua pertanyaan aja, biar kami tahu siapa yang cocok nemenin kamu.</Body>

      <Text className="text-sm font-semibold text-text">Ini soal apa?</Text>
      <TextInput
        accessibilityLabel="Ini soal apa"
        value={topic}
        onChangeText={setTopic}
        maxLength={40}
        style={{ minHeight: TOUCH_TARGET }}
        className="rounded-curhat border border-border bg-surface px-4 text-text"
      />

      <Text className="text-sm font-semibold text-text">Sekarang rasanya gimana?</Text>
      <TextInput
        accessibilityLabel="Sekarang rasanya gimana"
        value={emotion}
        onChangeText={setEmotion}
        maxLength={40}
        style={{ minHeight: TOUCH_TARGET }}
        className="rounded-curhat border border-border bg-surface px-4 text-text"
      />

      <ErrorText message={error} />
      <PrimaryButton
        label="Cariin aku pendengar"
        disabled={topic.trim().length === 0 || emotion.trim().length === 0}
        onPress={() => void submit()}
      />
    </ScreenScroll>
  );
}
