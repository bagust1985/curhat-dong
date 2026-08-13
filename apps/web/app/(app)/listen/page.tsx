'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import { relativeTime } from '../../../lib/relative-time';
import {
  GuidelinesGate,
  ListenerStatsPanel,
  MatchOfferModal,
  RestStateBanner,
  type BurnoutState,
  type GuidelineSection,
  type ListenerStats,
  type OfferData,
} from '../../../components/listener';

/**
 * `/listen` — E15-T13. DESIGN-REF §2.9, §2.20, PRD §11, §12.
 *
 * Activation, dashboard and offers on one route, because they are one state
 * machine: not activated → guidelines; activated → dashboard; offer pending →
 * the offer sits above everything else.
 *
 * Offers are polled rather than pushed here. The socket channel exists
 * (`match:offer`), but a listener who has the tab open with a stale socket must
 * not silently stop receiving offers — a 10 second poll is the floor that keeps
 * the feature honest, and the socket is an optimisation on top of it (E16).
 */

interface ListenerProfile {
  topics: string[];
  languages: string[];
  maxConcurrent: number;
  isAvailable: boolean;
  safetyStatus: string;
  guidelinesVersionAccepted: string | null;
  needsGuidelinesAcceptance: boolean;
}

export default function ListenPage() {
  const router = useRouter();

  const [guidelines, setGuidelines] = useState<{
    version: string;
    sections: GuidelineSection[];
  } | null>(null);
  const [profile, setProfile] = useState<ListenerProfile | null>(null);
  const [stats, setStats] = useState<(ListenerStats & { burnout: BurnoutState }) | null>(null);
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api<ListenerProfile>('/listener/profile');
      setProfile(data);
      return data;
    } catch (cause) {
      // Not a listener yet — the guidelines screen is the correct landing spot,
      // not an error.
      if (cause instanceof ApiError && cause.status === 404) setProfile(null);
      return null;
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
        setError('Panduannya belum bisa dimuat. Coba lagi sebentar lagi ya.');
      }
      await loadProfile();
    })();
  }, [loadProfile]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api<ListenerStats & { burnout: BurnoutState }>('/listener/stats');
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    if (!profile || profile.needsGuidelinesAcceptance) return;
    void loadStats();
  }, [loadStats, profile]);

  // Offer polling — see the note at the top of the file.
  useEffect(() => {
    if (!profile?.isAvailable) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api<OfferData[]>('/listener/offers');
        if (!cancelled) setOffer(data[0] ?? null);
      } catch {
        /* a failed poll is not worth an error banner */
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [profile?.isAvailable]);

  const activate = useCallback(
    async (version: string) => {
      setPending(true);
      setError(null);
      try {
        await api('/listener/activate', { method: 'POST', body: { guidelinesVersion: version } });
        await loadProfile();
      } catch {
        setError('Belum bisa diaktifkan. Coba lagi sebentar lagi ya.');
      } finally {
        setPending(false);
      }
    },
    [loadProfile],
  );

  const setAvailability = useCallback(
    async (isAvailable: boolean) => {
      setProfile((current) => (current ? { ...current, isAvailable } : current));
      try {
        await api('/listener/availability', { method: 'PUT', body: { isAvailable } });
      } catch {
        setProfile((current) =>
          current ? { ...current, isAvailable: !isAvailable } : current,
        );
        setError('Statusnya belum kesimpan. Coba lagi ya.');
      }
    },
    [],
  );

  const acceptOffer = useCallback(
    async (matchId: string) => {
      setOffer(null);
      try {
        const { data } = await api<{ sessionId: string; roomId: string }>(
          `/listener/matches/${matchId}/accept`,
          { method: 'POST', body: {} },
        );
        router.push(`/room/${data.roomId}`);
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === 'MATCH_OFFER_EXPIRED') {
          setNotice('Tawarannya keburu lewat. Nggak apa-apa — nanti ada lagi.');
        } else if (cause instanceof ApiError && cause.code === 'MATCH_OFFER_ALREADY_TAKEN') {
          setNotice('Udah ada yang duluan nemenin. Makasih ya udah mau.');
        } else {
          setNotice('Belum bisa masuk ke ruangnya. Coba lagi ya.');
        }
      }
    },
    [router],
  );

  const declineOffer = useCallback(async (matchId: string) => {
    setOffer(null);
    try {
      await api(`/listener/matches/${matchId}/decline`, { method: 'POST', body: {} });
    } catch {
      /* declining is best-effort; the offer expires anyway */
    }
  }, []);

  if (!profile || profile.needsGuidelinesAcceptance) {
    return (
      <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
        {guidelines ? (
          <GuidelinesGate
            version={guidelines.version}
            sections={guidelines.sections}
            onAccept={(version) => void activate(version)}
            pending={pending}
          />
        ) : (
          <p role="status">Lagi memuat panduan…</p>
        )}
        <p role="alert" className="mt-3 min-h-5 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Mode dengerin</h1>

      {offer ? (
        <div className="mt-4">
          <MatchOfferModal
            offer={offer}
            onAccept={(matchId) => void acceptOffer(matchId)}
            onDecline={(matchId) => void declineOffer(matchId)}
          />
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-[var(--color-muted)]">
        {notice}
      </p>

      <div className="mt-4">
        {stats ? <RestStateBanner state={stats.burnout} /> : null}
      </div>

      <section aria-labelledby="availability-heading" className="mt-6">
        <h2 id="availability-heading" className="text-base font-semibold text-[var(--color-text)]">
          Status
        </h2>
        <label className="mt-2 flex min-h-[var(--size-touch)] items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={profile.isAvailable}
            disabled={stats?.burnout.dailyCapReached === true}
            onChange={(event) => void setAvailability(event.target.checked)}
            className="size-5"
          />
          <span>
            Aku lagi siap dengerin
            <span className="block text-[var(--color-muted)]">
              Matiin kapan aja. Nggak ada penalti, nggak ada yang ngitungin.
            </span>
          </span>
        </label>
      </section>

      <div className="mt-8">
        {stats ? (
          <ListenerStatsPanel stats={stats} />
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Catatanmu belum bisa dimuat.</p>
        )}
      </div>

      {stats && stats.recentSessions.length > 0 ? (
        <section aria-labelledby="history-heading" className="mt-8">
          <h2 id="history-heading" className="text-base font-semibold text-[var(--color-text)]">
            Sesi terakhir
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {stats.recentSessions.map((session) => (
              <li
                key={session.startedAt}
                className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)]"
              >
                {relativeTime(session.startedAt)}
                {session.minutes !== null ? ` · ${session.minutes} menit` : ' · masih berjalan'}
              </li>
            ))}
          </ul>
          {/*
           * Times and durations only. What was said in a session never appears
           * anywhere outside the room, including in the listener's own history.
           */}
        </section>
      ) : null}

      <p role="alert" className="mt-6 min-h-5 text-sm text-[var(--color-danger)]">
        {error}
      </p>
    </main>
  );
}
