import { useCallback, useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ApiError, api } from '../../lib/api';
import { relativeTime } from '../../lib/relative-time';
import { Body, ErrorText, Heading, PrimaryButton, ScreenScroll } from '../../components/ui';

/**
 * Moderation history and appeals — E16-T10. DESIGN-REF §2.19, PRD §15.4.
 *
 * Five states per row, all said plainly, and the moderator is never named —
 * the API does not send it and asking would invite retaliation against a
 * volunteer.
 */

interface AppealRef {
  id: string;
  status: 'pending' | 'upheld' | 'overturned' | 'reduced';
}

interface ModerationAction {
  actionId: string;
  action: string;
  reason: string;
  createdAt: string;
  appealable: boolean;
  appealDeadline: string | null;
  appeal: AppealRef | null;
}

const ACTION_LABELS: Record<string, string> = {
  remove: 'Konten dihapus',
  hide: 'Konten disembunyikan',
  warn: 'Peringatan',
  mute: 'Dibisukan sementara',
  suspend: 'Akun ditangguhkan sementara',
  ban: 'Akun ditutup',
};

const APPEAL_COPY: Record<AppealRef['status'], string> = {
  pending: 'Bandingmu lagi ditinjau orang lain, bukan yang mutusin sebelumnya.',
  upheld: 'Setelah ditinjau ulang, keputusannya tetap.',
  overturned: 'Setelah ditinjau ulang, keputusannya dibatalkan.',
  reduced: 'Setelah ditinjau ulang, hukumannya dikurangi.',
};

export default function ModerationActionsScreen() {
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api<ModerationAction[]>('/me/moderation-actions');
      setActions(data);
    } catch {
      setActions([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    async (actionId: string) => {
      setError(null);
      if (reason.trim().length < 20) {
        setError('Ceritain sedikit lebih panjang ya — minimal 20 huruf, biar bisa ditimbang.');
        return;
      }
      try {
        await api('/appeals', { method: 'POST', body: { actionId, reason: reason.trim() } });
        setOpenFor(null);
        setReason('');
        setNotice('Bandingmu udah masuk. Kami kabarin kalau udah ada hasilnya.');
        await load();
      } catch (cause) {
        setError(
          cause instanceof ApiError && cause.code === 'APPEAL_WINDOW_EXPIRED'
            ? 'Waktu buat banding udah lewat.'
            : 'Bandingnya belum kekirim. Coba lagi ya.',
        );
      }
    },
    [load, reason],
  );

  return (
    <ScreenScroll>
      <Heading>Riwayat moderasi</Heading>
      {notice ? <Body muted>{notice}</Body> : null}

      {loaded && actions.length === 0 ? <Body>Nggak ada apa-apa di sini. Bagus.</Body> : null}

      {actions.map((action) => (
        <View key={action.actionId} className="rounded-curhat bg-surface p-4">
          <Text accessibilityRole="header" className="font-bold text-text">
            {ACTION_LABELS[action.action] ?? action.action}
          </Text>
          <Text className="mt-1 text-sm text-muted">{relativeTime(action.createdAt)}</Text>
          <Text className="mt-2 text-sm text-text">{action.reason}</Text>

          {action.appeal ? (
            <Text className="mt-3 text-sm text-text">{APPEAL_COPY[action.appeal.status]}</Text>
          ) : action.appealable ? (
            openFor === action.actionId ? (
              <View className="mt-3 gap-2">
                <Text className="text-sm font-bold text-text">Ceritain dari sisi kamu</Text>
                <TextInput
                  accessibilityLabel="Ceritain dari sisi kamu"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={4}
                  maxLength={2000}
                  className="min-h-24 rounded-curhat bg-surface p-3 text-text"
                />
                <Text className="text-sm text-muted">
                  Yang meninjau bandingmu bukan orang yang ngambil keputusan ini.
                </Text>
                <ErrorText message={error} />
                <PrimaryButton label="Kirim banding" onPress={() => void submit(action.actionId)} />
              </View>
            ) : (
              <View className="mt-3">
                <PrimaryButton
                  label="Ajukan banding"
                  onPress={() => setOpenFor(action.actionId)}
                />
              </View>
            )
          ) : (
            <Text className="mt-3 text-sm text-muted">
              {action.appealDeadline
                ? 'Waktu buat banding yang ini udah lewat.'
                : 'Yang ini nggak bisa dibanding.'}
            </Text>
          )}
        </View>
      ))}
    </ScreenScroll>
  );
}
