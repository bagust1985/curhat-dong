'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../../../../lib/api';
import { relativeTime } from '../../../../lib/relative-time';

/**
 * `/moderation/actions` — E15-T16. DESIGN-REF §2.19, PRD §15.4.
 *
 * Every action taken against this account, and exactly one of five states per
 * row: appealable, already appealed and waiting, decided, window closed, or not
 * appealable at all. Each one is said plainly — a person who was moderated
 * should never have to guess whether they still have a way to respond.
 *
 * The moderator's identity is never shown. The API does not send it, and asking
 * for it would invite retaliation against a volunteer (moderation.service.ts).
 */

interface AppealRef {
  id: string;
  status: 'pending' | 'upheld' | 'overturned' | 'reduced';
  decidedAt: string | null;
}

interface ModerationAction {
  actionId: string;
  action: string;
  reason: string;
  durationHours: number | null;
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

const APPEAL_STATUS_COPY: Record<AppealRef['status'], string> = {
  pending: 'Bandingmu lagi ditinjau orang lain, bukan yang mutusin sebelumnya.',
  upheld: 'Setelah ditinjau ulang, keputusannya tetap.',
  overturned: 'Setelah ditinjau ulang, keputusannya dibatalkan.',
  reduced: 'Setelah ditinjau ulang, hukumannya dikurangi.',
};

export default function ModerationActionsPage() {
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        if (cause instanceof ApiError && cause.code === 'APPEAL_WINDOW_EXPIRED') {
          setError('Waktu buat banding udah lewat.');
        } else if (cause instanceof ApiError && cause.code === 'APPEAL_ALREADY_SUBMITTED') {
          setError('Kamu udah pernah banding buat yang ini.');
        } else if (cause instanceof ApiError && cause.code === 'APPEAL_ACTION_NOT_APPEALABLE') {
          setError('Yang ini nggak bisa dibanding.');
        } else {
          setError('Bandingnya belum kekirim. Coba lagi ya.');
        }
      }
    },
    [load, reason],
  );

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Riwayat moderasi</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Semua tindakan yang pernah kami ambil ke akunmu, dan apa yang masih bisa kamu lakukan.
      </p>

      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-[var(--color-muted)]">
        {notice}
      </p>

      {loaded && actions.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-curhat)] border border-dashed border-[var(--color-border)] p-6 text-center text-[var(--color-text)]">
          Nggak ada apa-apa di sini. Bagus.
        </p>
      ) : null}

      <ul className="mt-6 flex flex-col gap-4">
        {actions.map((action) => (
          <li
            key={action.actionId}
            className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <h2 className="font-semibold text-[var(--color-text)]">
              {ACTION_LABELS[action.action] ?? action.action}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {relativeTime(action.createdAt)}
              {action.durationHours ? ` · ${action.durationHours} jam` : ''}
            </p>
            <p className="mt-2 text-sm text-[var(--color-text)]">{action.reason}</p>

            {action.appeal ? (
              <p className="mt-3 text-sm text-[var(--color-text)]">
                {APPEAL_STATUS_COPY[action.appeal.status]}
              </p>
            ) : action.appealable ? (
              <>
                {openFor === action.actionId ? (
                  <div className="mt-3">
                    <label
                      htmlFor={`appeal-${action.actionId}`}
                      className="block text-sm font-semibold text-[var(--color-text)]"
                    >
                      Ceritain dari sisi kamu
                    </label>
                    <textarea
                      id={`appeal-${action.actionId}`}
                      rows={4}
                      value={reason}
                      maxLength={2000}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-2 w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]"
                    />
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      Yang meninjau bandingmu bukan orang yang ngambil keputusan ini.
                    </p>
                    <p role="alert" className="mt-2 min-h-5 text-sm text-[var(--color-danger)]">
                      {error}
                    </p>
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => void submit(action.actionId)}
                        className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
                      >
                        Kirim banding
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenFor(null);
                          setError(null);
                        }}
                        className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setOpenFor(action.actionId)}
                      className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 text-sm font-semibold text-[var(--color-text)]"
                    >
                      Ajukan banding
                    </button>
                    {action.appealDeadline ? (
                      <p className="mt-1 text-sm text-[var(--color-muted)]">
                        Bisa diajukan sampai{' '}
                        {new Date(action.appealDeadline).toLocaleDateString('id-ID')}.
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                {action.appealDeadline
                  ? 'Waktu buat banding yang ini udah lewat.'
                  : 'Yang ini nggak bisa dibanding.'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
