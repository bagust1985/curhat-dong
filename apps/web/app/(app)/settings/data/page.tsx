'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { DestructiveConfirm } from '../../../../components/safety';

/**
 * `/settings/data` — E15-T16. DESIGN-REF §2.16, PRD §25.
 *
 * Consent, export and deletion. Its own screen because each of these deserves
 * to be read rather than skimmed past a list of toggles.
 *
 * The deletion flow states the consequences the server actually produces
 * (`/me/deletion-consequences`) rather than a copy written here. Two of them
 * are the ones people are most surprised by, and both are stated plainly:
 * messages already in somebody else's room are not deleted, and backups take
 * up to 30 days to age out.
 */

type ConsentType = 'tos_privacy' | 'sensitive_processing' | 'analytics';

interface ConsentState {
  consents: Array<{ consentType: ConsentType; granted: boolean; grantedAt: string | null }>;
}

type DeleteMode = 'purge' | 'anonymize';

export default function DataSettingsPage() {
  const router = useRouter();
  const { signOut } = useSession();

  const [consents, setConsents] = useState<ConsentState['consents']>([]);
  const [mode, setMode] = useState<DeleteMode>('purge');
  const [consequences, setConsequences] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<ConsentState>('/me/consents');
        setConsents(data.consents);
      } catch {
        setConsents([]);
      }
    })();
  }, []);

  const loadConsequences = useCallback(async (next: DeleteMode) => {
    setMode(next);
    try {
      const { data } = await api<{ mode: DeleteMode; consequences: string[] }>(
        '/me/deletion-consequences',
        { query: { mode: next } },
      );
      setConsequences(data.consequences);
    } catch {
      setConsequences([]);
    }
  }, []);

  useEffect(() => {
    void loadConsequences('purge');
  }, [loadConsequences]);

  const setAnalytics = useCallback(async (granted: boolean) => {
    setConsents((current) =>
      current.map((entry) =>
        entry.consentType === 'analytics' ? { ...entry, granted } : entry,
      ),
    );
    try {
      await api('/me/consents', {
        method: 'POST',
        body: { consents: [{ consentType: 'analytics', granted }] },
      });
      setNotice(
        granted ? 'Makasih, ini bantu kami banyak.' : 'Udah dimatiin. Semua fitur tetap jalan.',
      );
    } catch {
      setNotice('Belum kesimpan. Coba lagi ya.');
    }
  }, []);

  const requestExport = useCallback(async () => {
    try {
      await api('/me/export', { method: 'POST', body: {} });
      setNotice('Datamu lagi kami siapkan. Nanti kami kabarin kalau udah siap diunduh.');
    } catch {
      setNotice('Permintaannya belum kekirim. Coba lagi ya.');
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      await api('/me', {
        method: 'DELETE',
        body: { mode, confirmation: 'HAPUS AKUN' },
      });
      await signOut();
      router.push('/');
    } catch {
      setNotice('Belum bisa diproses. Coba lagi sebentar lagi ya.');
      setConfirming(false);
    }
  }, [mode, router, signOut]);

  const analytics = consents.find((entry) => entry.consentType === 'analytics');

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Data & privasi</h1>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-[var(--color-muted)]">
        {notice}
      </p>

      <section aria-labelledby="consent-heading" className="mt-6">
        <h2 id="consent-heading" className="text-lg font-bold text-[var(--color-text)]">
          Persetujuan
        </h2>

        <div className="mt-3 rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <label className="flex min-h-[var(--size-touch)] items-start gap-3 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={analytics?.granted === true}
              onChange={(event) => void setAnalytics(event.target.checked)}
              className="mt-1 size-5"
            />
            <span>
              <span className="block font-semibold">Analitik & pengembangan produk</span>
              <span className="mt-1 block text-[var(--color-muted)]">
                Boleh nggak diaktifin, semua fitur tetap jalan.
              </span>
            </span>
          </label>
        </div>

        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Dua persetujuan lainnya — syarat layanan dan pemrosesan isi curhat — nggak bisa dimatiin
          tanpa menutup akun, karena tanpa itu kami nggak bisa menjaga ruang ini tetap aman.
        </p>
      </section>

      <section aria-labelledby="export-heading" className="mt-10">
        <h2 id="export-heading" className="text-lg font-bold text-[var(--color-text)]">
          Unduh datamu
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Isinya curhat, komentar, dan pengaturanmu. Pesan di ruang ngobrol ikut sebatas yang kamu
          tulis sendiri.
        </p>
        <button
          type="button"
          onClick={() => void requestExport()}
          className="mt-3 min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 font-semibold text-[var(--color-text)]"
        >
          Minta salinan data
        </button>
      </section>

      <section aria-labelledby="delete-heading" className="mt-10">
        <h2 id="delete-heading" className="text-lg font-bold text-[var(--color-text)]">
          Hapus akun
        </h2>

        <div role="radiogroup" aria-label="Cara menghapus" className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'purge'}
            onClick={() => void loadConsequences('purge')}
            className={`min-h-[var(--size-touch)] rounded-[var(--radius-curhat)] border px-4 py-3 text-left ${
              mode === 'purge'
                ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            <span className="block font-semibold text-[var(--color-text)]">
              Hapus semua yang aku tulis
            </span>
            <span className="block text-sm text-[var(--color-muted)]">
              Curhat dan komentarmu ikut hilang.
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={mode === 'anonymize'}
            onClick={() => void loadConsequences('anonymize')}
            className={`min-h-[var(--size-touch)] rounded-[var(--radius-curhat)] border px-4 py-3 text-left ${
              mode === 'anonymize'
                ? 'border-[var(--color-primary)] bg-[var(--color-surface-alt)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            <span className="block font-semibold text-[var(--color-text)]">
              Tinggalin tulisanku tanpa nama
            </span>
            <span className="block text-sm text-[var(--color-muted)]">
              Ceritamu tetap ada buat yang membacanya, tapi nggak lagi nyambung ke kamu.
              <strong className="block font-semibold text-[var(--color-text)]">
                Ini nggak bisa dibatalin — tulisannya nggak bisa dibalikin ke kamu lagi.
              </strong>
            </span>
          </button>
        </div>

        {consequences.length > 0 ? (
          <div className="mt-4 rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Yang bakal terjadi</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--color-text)]">
              {consequences.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {confirming ? (
          <div className="mt-4">
            <DestructiveConfirm
              title="Yakin mau nutup akunmu?"
              consequences={consequences}
              confirmPhrase="HAPUS AKUN"
              confirmLabel="Hapus akunku"
              onConfirm={() => void deleteAccount()}
              onCancel={() => setConfirming(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-danger)] px-5 font-semibold text-[var(--color-text)]"
          >
            Lanjut hapus akun
          </button>
        )}
      </section>
    </main>
  );
}
