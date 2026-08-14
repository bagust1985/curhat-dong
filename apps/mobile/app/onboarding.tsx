import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../components/ui';
import { TOUCH_TARGET } from '../lib/tokens';

/**
 * `/onboarding` — E16-T05. DESIGN-REF §2.3, PRD §25.3.
 *
 * The same seven steps as the web and the same two rules that matter: nothing
 * is pre-checked, and all three consent answers are transmitted — a refusal is
 * a compliance record too.
 *
 * Everything is held in memory until the final submit, mirroring the API's
 * atomic completion: closing the app at step 4 leaves no half-created account.
 */

const CONSENTS = [
  {
    type: 'tos_privacy' as const,
    title: 'Syarat & Ketentuan dan Kebijakan Privasi',
    body: 'Aku sudah baca dan setuju dengan aturan main dan cara CURHAT DONG memperlakukan data aku.',
    required: true,
  },
  {
    type: 'sensitive_processing' as const,
    title: 'Pemrosesan isi curhat',
    body: 'Isi curhat kamu dibaca sistem otomatis untuk menjaga keamanan dan mencocokkan kamu dengan orang yang tepat.',
    required: true,
  },
  {
    type: 'analytics' as const,
    title: 'Analitik & pengembangan produk',
    body: 'Boleh nggak diaktifin, semua fitur tetap jalan.',
    required: false,
  },
];

const REASONS = [
  { value: 'cerita', label: 'Mau cerita' },
  { value: 'mendengarkan', label: 'Mau mendengarkan' },
  { value: 'keduanya', label: 'Keduanya' },
  { value: 'lihat_lihat', label: 'Cuma lihat-lihat dulu' },
] as const;

const SAFETY_RULES = [
  'Cerita orang lain bukan bahan obrolan di luar. Jangan di-screenshot, jangan disebar.',
  'Jangan bagikan identitas siapa pun — termasuk identitasmu sendiri.',
  'Nggak ada yang perlu diceramahi. Kalau nggak tahu mau bilang apa, "aku dengerin" udah cukup.',
  'Ada tim moderasi dan sistem keamanan otomatis.',
  'Ini bukan layanan darurat. Kalau ada bahaya sekarang, hubungi layanan darurat di sekitarmu.',
];

const TITLES = [
  'Selamat datang',
  'Kamu ke sini buat apa?',
  'Nama samaran kamu',
  'Persetujuan',
  'Aturan main',
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { reload } = useSession();

  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [alias, setAlias] = useState('');
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await api('/onboarding', {
        method: 'POST',
        body: {
          isAdult: true,
          consents: CONSENTS.map((item) => ({
            consentType: item.type,
            granted: granted[item.type] === true,
          })),
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(reason ? { reason } : {}),
        },
      });
      await reload();
      router.replace('/');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'ALIAS_TAKEN') {
        setError('Nama samaran itu keburu diambil orang. Pilih yang lain ya.');
        setStep(2);
      } else {
        setError('Belum berhasil disimpan. Coba lagi sebentar lagi ya.');
      }
    } finally {
      setPending(false);
    }
  }, [alias, granted, reason, reload, router]);

  const consentSatisfied =
    granted['tos_privacy'] === true && granted['sensitive_processing'] === true;
  const canContinue = step === 3 ? consentSatisfied : step === 4 ? acknowledged : true;

  return (
    <ScreenScroll>
      <Text className="text-sm text-muted">
        Langkah {step + 1} dari {TITLES.length}
      </Text>
      <Heading>{TITLES[step]}</Heading>

      {step === 0 ? (
        <>
          <Body>Di sini kamu nggak harus terlihat baik-baik saja.</Body>
          <Body muted>Sebentar aja — beberapa pertanyaan biar kami tahu cara nemenin kamu.</Body>
        </>
      ) : null}

      {step === 1
        ? REASONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: reason === option.value }}
              accessibilityLabel={option.label}
              onPress={() => setReason(option.value)}
              style={{ minHeight: TOUCH_TARGET }}
              className={`justify-center rounded-curhat border px-4 ${
                reason === option.value ? 'border-primary bg-tint-pink' : 'border-border bg-surface'
              }`}
            >
              <Text className="font-bold text-text">{option.label}</Text>
            </Pressable>
          ))
        : null}

      {step === 2 ? (
        <>
          <Text className="text-sm font-bold text-text">Nama samaran</Text>
          <TextInput
            accessibilityLabel="Nama samaran"
            value={alias}
            onChangeText={setAlias}
            autoCapitalize="none"
            maxLength={24}
            style={{ minHeight: TOUCH_TARGET }}
            className="rounded-curhat bg-surface px-4 text-text"
          />
          <Body muted>Kosongin aja kalau mau kami yang buatin.</Body>
        </>
      ) : null}

      {step === 3
        ? CONSENTS.map((item) => (
            <View key={item.type} className="rounded-curhat bg-surface p-4">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 font-bold text-text">
                  {item.title}{' '}
                  <Text className="text-xs font-normal text-muted">
                    {item.required ? 'Wajib' : 'Opsional'}
                  </Text>
                </Text>
                <Switch
                  accessibilityLabel={item.title}
                  // Never defaulted to true — a pre-ticked box is not consent.
                  value={granted[item.type] === true}
                  onValueChange={(value) =>
                    setGranted((current) => ({ ...current, [item.type]: value }))
                  }
                />
              </View>
              <Text className="mt-1 text-sm text-muted">{item.body}</Text>
            </View>
          ))
        : null}

      {step === 4 ? (
        <>
          <Body muted>
            Ini kesepakatan soal cara kita memperlakukan satu sama lain — beda dari persetujuan
            data di langkah sebelumnya.
          </Body>
          {SAFETY_RULES.map((rule) => (
            <View key={rule} className="rounded-curhat bg-surface p-4">
              <Text className="text-sm leading-5 text-text">{rule}</Text>
            </View>
          ))}
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-sm text-text">Aku ngerti dan siap jaga ruang ini.</Text>
            <Switch
              accessibilityLabel="Aku ngerti dan siap jaga ruang ini"
              value={acknowledged}
              onValueChange={setAcknowledged}
            />
          </View>
        </>
      ) : null}

      <ErrorText message={error} />

      <PrimaryButton
        label={step === TITLES.length - 1 ? 'Masuk ke beranda' : 'Lanjut'}
        disabled={!canContinue || pending}
        onPress={() => (step === TITLES.length - 1 ? void submit() : setStep(step + 1))}
      />

      {step === 1 ? <SecondaryButton label="Lewati dulu" onPress={() => setStep(step + 1)} /> : null}
      {step > 0 ? <SecondaryButton label="Kembali" onPress={() => setStep(step - 1)} /> : null}
    </ScreenScroll>
  );
}
