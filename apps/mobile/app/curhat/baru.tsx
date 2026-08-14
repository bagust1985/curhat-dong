import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { ApiError, api } from '../../lib/api';
import { EMPTY_DRAFT, clearDraft, loadDraft, saveDraft, type Draft } from '../../lib/draft';
import { PERSONAL_DATA_WARNING, detectPersonalData } from '../../lib/personal-data';
import { maybeEnablePush } from '../../lib/push';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../../components/ui';
import { MOODS, MOOD_VOCABULARY, INTENTS, INTENT_VOCABULARY } from '@curhat/types';
import { TOUCH_TARGET } from '../../lib/tokens';

/**
 * Create curhat — E16-T05. DESIGN-REF §2.6, PRD §7.
 *
 * Full screen on mobile rather than a modal, and otherwise the same three rules
 * as the web: the doxxing warning appears while typing and never blocks, the
 * draft is autosaved, and the three submit outcomes are separate screens rather
 * than one toast.
 */

interface CreateResponse {
  postId: string;
  status: 'published' | 'held';
  intervention?: { message: string; resources: unknown[]; usingFallback: boolean };
}

export default function CreateCurhatScreen() {
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [restored, setRestored] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [categories, setCategories] = useState<Array<{ slug: string; name: string }>>([]);
  const [outcome, setOutcome] = useState<'idle' | 'published' | 'held' | 'intervention'>('idle');
  const [interventionMessage, setInterventionMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await loadDraft();
      if (stored) {
        setDraft(stored);
        setRestored(true);
      }
      try {
        const { data } = await api<Array<{ slug: string; name: string }>>('/categories');
        setCategories(data);
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  useEffect(() => {
    void saveDraft(draft);
  }, [draft]);

  const hints = useMemo(() => detectPersonalData(`${draft.title}\n${draft.body}`), [draft]);
  const ready =
    draft.body.trim().length >= 20 && draft.categorySlug && draft.mood && draft.intent;

  const submit = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const { data } = await api<CreateResponse>('/posts', {
        method: 'POST',
        body: {
          ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
          body: draft.body.trim(),
          categorySlug: draft.categorySlug,
          mood: draft.mood,
          intent: draft.intent,
          anonymityMode: draft.anonymityMode,
          allowComments: draft.allowComments,
          requestListener: draft.requestListener,
          acknowledgedPersonalDataWarning: acknowledged || hints.length === 0,
        },
      });

      await clearDraft();
      // First real thing they did. Asking now means the prompt is about
      // something they just chose (E16-T09).
      void maybeEnablePush('after_first_post');

      if (data.intervention) {
        setInterventionMessage(data.intervention.message);
        setOutcome('intervention');
      } else {
        setOutcome(data.status === 'held' ? 'held' : 'published');
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'RATE_LIMITED'
          ? 'Kamu baru aja posting. Tarik napas sebentar, lalu coba lagi ya.'
          : 'Belum kekirim. Ceritamu masih tersimpan kok — coba lagi ya.',
      );
    } finally {
      setPending(false);
    }
  }, [acknowledged, draft, hints.length]);

  if (outcome === 'intervention') {
    return (
      <ScreenScroll>
        <Heading>Kamu nggak sendirian.</Heading>
        <Body>{interventionMessage}</Body>
        <Body muted>
          Kalau kamu dalam bahaya sekarang, hubungi layanan darurat di sekitarmu, atau bangunin
          satu orang yang kamu percaya.
        </Body>
        <SecondaryButton label="Ngobrol sama DONG AI" onPress={() => router.replace('/ai')} />
        <SecondaryButton
          label="Cari Listener sekarang"
          onPress={() => router.replace('/listener/request')}
        />
        <PrimaryButton label="Aku mengerti, tutup" onPress={() => router.replace('/')} />
      </ScreenScroll>
    );
  }

  if (outcome === 'held' || outcome === 'published') {
    return (
      <ScreenScroll>
        <Heading>
          {outcome === 'held' ? 'Curhatmu kami tinjau dulu sebentar ya' : 'Udah kekirim 🤍'}
        </Heading>
        <Body muted>
          {outcome === 'held'
            ? 'Buat sekarang cuma kamu yang bisa lihat. Ini bukan hukuman.'
            : 'Sekarang ceritamu bisa dibaca orang lain.'}
        </Body>
        <PrimaryButton label="Kembali ke beranda" onPress={() => router.replace('/')} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <Heading>Hari ini kamu mau cerita apa?</Heading>
      {restored ? <Body muted>Tulisanmu yang belum kekirim kami simpan.</Body> : null}

      <Text className="text-sm font-bold text-text">Judul (opsional)</Text>
      <TextInput
        accessibilityLabel="Judul"
        value={draft.title}
        onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        maxLength={160}
        style={{ minHeight: TOUCH_TARGET }}
        className="rounded-curhat bg-surface px-4 text-text"
      />

      <Text className="text-sm font-bold text-text">Ceritamu</Text>
      <TextInput
        accessibilityLabel="Ceritamu"
        value={draft.body}
        onChangeText={(body) => setDraft((current) => ({ ...current, body }))}
        multiline
        numberOfLines={8}
        maxLength={5000}
        className="min-h-40 rounded-curhat bg-surface p-4 leading-6 text-text"
      />
      <Text className="text-sm text-muted">Minimal 20 huruf biar ada yang bisa dibales.</Text>

      {hints.length > 0 ? (
        <View className="rounded-curhat border border-l-4 border-border border-l-accent-amber bg-surface p-4">
          <Text className="text-sm font-bold text-text">{PERSONAL_DATA_WARNING}</Text>
          <Text className="mt-1 text-sm text-muted">
            Kami nemu: {hints.map((hint) => hint.label).join(', ')}. Kamu tetap boleh lanjut.
          </Text>
          <View className="mt-3 flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-sm text-text">Aku ngerti, dan tetap mau kirim.</Text>
            <Switch
              accessibilityLabel="Aku ngerti, dan tetap mau kirim"
              value={acknowledged}
              onValueChange={setAcknowledged}
            />
          </View>
        </View>
      ) : null}

      <Text className="text-sm font-bold text-text">Topik</Text>
      <View className="flex-row flex-wrap gap-2">
        {categories.map((category) => (
          <Text
            key={category.slug}
            accessibilityRole="button"
            accessibilityState={{ selected: draft.categorySlug === category.slug }}
            onPress={() => setDraft((current) => ({ ...current, categorySlug: category.slug }))}
            className={`rounded-chip border px-4 py-2 text-sm ${
              draft.categorySlug === category.slug
                ? 'border-primary bg-tint-pink font-bold text-text'
                : 'border-border bg-surface text-text'
            }`}
          >
            {category.name}
          </Text>
        ))}
      </View>

      <Text className="text-sm font-bold text-text">Sekarang rasanya gimana?</Text>
      <View className="flex-row flex-wrap gap-2">
        {MOODS.map((mood) => (
          <Text
            key={mood}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.mood === mood }}
            accessibilityLabel={MOOD_VOCABULARY[mood].a11yLabel}
            onPress={() => setDraft((current) => ({ ...current, mood }))}
            className={`rounded-chip border px-3 py-2 text-sm ${
              draft.mood === mood ? 'border-primary bg-tint-pink font-bold text-text' : 'border-border bg-surface text-text'
            }`}
          >
            {MOOD_VOCABULARY[mood].glyph}
          </Text>
        ))}
      </View>

      <Text className="text-sm font-bold text-text">Kamu sedang cari apa?</Text>
      <View className="gap-2">
        {INTENTS.map((intent) => (
          <Text
            key={intent}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.intent === intent }}
            accessibilityLabel={INTENT_VOCABULARY[intent].a11yLabel}
            onPress={() => setDraft((current) => ({ ...current, intent }))}
            className={`rounded-curhat border px-4 py-3 text-sm ${
              draft.intent === intent ? 'border-primary bg-tint-pink font-bold text-text' : 'border-border bg-surface text-text'
            }`}
          >
            {INTENT_VOCABULARY[intent].glyph} {INTENT_VOCABULARY[intent].a11yLabel}
          </Text>
        ))}
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-text">
          Kirim sebagai anonim
          <Text className="text-muted"> — kode acak per curhat, bukan nama samaranmu.</Text>
        </Text>
        <Switch
          accessibilityLabel="Kirim sebagai anonim"
          value={draft.anonymityMode === 'anonymous'}
          onValueChange={(value) =>
            setDraft((current) => ({ ...current, anonymityMode: value ? 'anonymous' : 'alias' }))
          }
        />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-text">Izinkan orang membalas</Text>
        <Switch
          accessibilityLabel="Izinkan orang membalas"
          value={draft.allowComments}
          onValueChange={(allowComments) => setDraft((current) => ({ ...current, allowComments }))}
        />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-text">Sekalian cariin listener buat aku</Text>
        <Switch
          accessibilityLabel="Sekalian cariin listener buat aku"
          value={draft.requestListener}
          onValueChange={(requestListener) =>
            setDraft((current) => ({ ...current, requestListener }))
          }
        />
      </View>

      <ErrorText message={error} />
      <PrimaryButton
        label={pending ? 'Lagi dikirim…' : 'Kirim curhat'}
        disabled={!ready || pending}
        onPress={() => void submit()}
      />
    </ScreenScroll>
  );
}
