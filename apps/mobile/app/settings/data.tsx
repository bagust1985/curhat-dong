import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll, SecondaryButton } from '../../components/ui';

/**
 * Data & privacy — E16-T10. DESIGN-REF §2.16, PRD §25.
 *
 * The deletion consequences come from `/me/deletion-consequences` rather than
 * being written here, so the two things people are most surprised by — messages
 * already in somebody else's room are not deleted, backups take 30 days — always
 * match what the backend actually does, and match the web word for word.
 */

type DeleteMode = 'purge' | 'anonymize';

export default function DataSettingsScreen() {
  const { signOut } = useSession();

  const [analytics, setAnalytics] = useState(false);
  const [mode, setMode] = useState<DeleteMode>('purge');
  const [consequences, setConsequences] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<{ consents: Array<{ consentType: string; granted: boolean }> }>(
          '/me/consents',
        );
        setAnalytics(data.consents.some((c) => c.consentType === 'analytics' && c.granted));
      } catch {
        setAnalytics(false);
      }
    })();
  }, []);

  const loadConsequences = useCallback(async (next: DeleteMode) => {
    setMode(next);
    try {
      const { data } = await api<{ consequences: string[] }>('/me/deletion-consequences', {
        query: { mode: next },
      });
      setConsequences(data.consequences);
    } catch {
      setConsequences([]);
    }
  }, []);

  useEffect(() => {
    void loadConsequences('purge');
  }, [loadConsequences]);

  return (
    <ScreenScroll>
      <Heading>Data & privasi</Heading>
      {notice ? <Body muted>{notice}</Body> : null}

      <View className="rounded-curhat border border-border bg-surface p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-semibold text-text">Analitik & pengembangan produk</Text>
          <Switch
            accessibilityLabel="Analitik dan pengembangan produk"
            value={analytics}
            onValueChange={(value) => {
              setAnalytics(value);
              void api('/me/consents', {
                method: 'POST',
                body: { consents: [{ consentType: 'analytics', granted: value }] },
              })
                .then(() =>
                  setNotice(
                    value
                      ? 'Makasih, ini bantu kami banyak.'
                      : 'Udah dimatiin. Semua fitur tetap jalan.',
                  ),
                )
                .catch(() => setNotice('Belum kesimpan. Coba lagi ya.'));
            }}
          />
        </View>
        <Text className="mt-1 text-sm text-muted">
          Boleh nggak diaktifin, semua fitur tetap jalan.
        </Text>
      </View>

      <SecondaryButton
        label="Minta salinan data"
        onPress={() => {
          void api('/me/export', { method: 'POST', body: {} })
            .then(() => setNotice('Datamu lagi kami siapkan. Nanti kami kabarin.'))
            .catch(() => setNotice('Permintaannya belum kekirim. Coba lagi ya.'));
        }}
      />

      <Text accessibilityRole="header" className="mt-4 text-lg font-bold text-text">
        Hapus akun
      </Text>

      <SecondaryButton
        label="Hapus semua yang aku tulis"
        accessibilityLabel="Hapus semua yang aku tulis"
        onPress={() => void loadConsequences('purge')}
      />
      <SecondaryButton
        label="Tinggalin tulisanku tanpa nama"
        accessibilityLabel="Tinggalin tulisanku tanpa nama, tidak bisa dibatalkan"
        onPress={() => void loadConsequences('anonymize')}
      />

      {mode === 'anonymize' ? (
        <Text className="text-sm font-semibold text-text">
          Ini nggak bisa dibatalin — tulisannya nggak bisa dibalikin ke kamu lagi.
        </Text>
      ) : null}

      {consequences.length > 0 ? (
        <View className="rounded-curhat border border-border bg-surface p-4">
          <Text className="text-sm font-semibold text-text">Yang bakal terjadi</Text>
          {consequences.map((line) => (
            <Text key={line} className="mt-1 text-sm text-text">
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <Text className="text-sm text-text">Ketik HAPUS AKUN buat lanjut.</Text>
      <TextInput
        accessibilityLabel="Ketik HAPUS AKUN"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        className="min-h-11 rounded-curhat border border-border bg-surface px-4 text-text"
      />

      <ErrorText message={error} />
      <PrimaryButton
        label="Hapus akunku"
        disabled={confirmation.trim() !== 'HAPUS AKUN'}
        onPress={() => {
          void api('/me', { method: 'DELETE', body: { mode, confirmation: 'HAPUS AKUN' } })
            .then(() => signOut())
            .catch(() => setError('Belum bisa diproses. Coba lagi sebentar lagi ya.'));
        }}
      />
    </ScreenScroll>
  );
}
