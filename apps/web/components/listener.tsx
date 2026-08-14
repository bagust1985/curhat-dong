'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Listener screens — E15-T13. DESIGN-REF §2.9, §2.20, PRD §11, §12.
 *
 * The rules that shape this file:
 *
 *  - **guidelines must be read to the bottom** before accept becomes live. The
 *    server refuses activation without the current version anyway (E10-T01) —
 *    this is the part that makes reading it plausible rather than provable;
 *  - **an offer shows the need, never the person.** Topic, emotion and mood.
 *    No alias, no age, no history;
 *  - **rest states are appreciative, not warnings**, and never offer a way to
 *    push through. A "continue anyway" button would make the cap decorative.
 */

export interface GuidelineSection {
  title: string;
  body: string;
}

export function GuidelinesGate({
  version,
  sections,
  onAccept,
  pending,
}: {
  version: string;
  sections: readonly GuidelineSection[];
  onAccept: (version: string) => void;
  pending: boolean;
}) {
  const [readToEnd, setReadToEnd] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const check = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    // 8px of slack: sub-pixel heights and zoom levels routinely leave a
    // scrollTop that never quite reaches the bottom, which would lock a reader
    // out of a button they earned.
    const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 8;
    if (atEnd) setReadToEnd(true);
  }, []);

  useEffect(() => {
    // A short list on a tall screen has nothing to scroll; treat that as read.
    const node = scroller.current;
    if (node && node.scrollHeight <= node.clientHeight + 8) setReadToEnd(true);
  }, [sections]);

  return (
    <section aria-labelledby="guidelines-heading">
      <h1 id="guidelines-heading" className="text-[26px] font-black text-[var(--color-text)]">
        Sebelum jadi listener
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Baca sampai habis ya. Ini yang bikin ruang di sini aman buat orang yang cerita.
      </p>

      <div
        ref={scroller}
        onScroll={check}
        tabIndex={0}
        role="region"
        aria-label="Panduan listener"
        className="mt-4 max-h-96 overflow-y-auto rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]"
      >
        <ul className="flex flex-col gap-4">
          {sections.map((section) => (
            <li key={section.title}>
              <h2 className="text-base font-semibold text-[var(--color-text)]">{section.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
                {section.body}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p role="status" className="mt-3 min-h-5 text-sm text-[var(--color-muted)]">
        {readToEnd ? 'Makasih udah baca sampai habis.' : 'Scroll sampai bawah dulu ya.'}
      </p>

      <button
        type="button"
        disabled={!readToEnd || pending}
        onClick={() => onAccept(version)}
        className="mt-3 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)] disabled:opacity-60"
      >
        Aku ngerti dan siap dengerin
      </button>
    </section>
  );
}

export interface BurnoutState {
  activeSessions: number;
  maxConcurrent: number;
  sessionsToday: number;
  maxSessionsPerDay: number;
  cooldownUntil: string | null;
  dailyCapReached: boolean;
  restReminder: boolean;
  message: string | null;
}

/**
 * Cooldown, daily cap and rest reminder — DESIGN-REF §2.20.
 *
 * One component for all three because they are one idea: you have done enough
 * for now. The server writes the sentence (burnout.service.ts) so it stays
 * appreciative in every client.
 */
export function RestStateBanner({ state }: { state: BurnoutState }) {
  const resting = state.dailyCapReached || state.cooldownUntil !== null || state.restReminder;
  if (!resting) return null;

  const heading = state.dailyCapReached
    ? 'Hari ini kamu udah cukup 🤍'
    : state.cooldownUntil
      ? 'Istirahat dulu sebentar'
      : 'Jangan lupa kamu juga butuh dengar-dengaran';

  return (
    <section
      aria-labelledby="rest-heading"
      className="rounded-[var(--radius-curhat)] bg-[var(--color-tint-amber)] p-5"
    >
      <h2 id="rest-heading" className="text-base font-black text-[var(--color-text)]">
        {heading}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text)]">
        {state.message ??
          'Kamu udah nemenin beberapa orang. Balik lagi kalau kamu udah pulih — nggak ada yang ngitungin.'}
      </p>
      {/*
       * No "lanjut aja" button. A cap with an override is decoration, and the
       * person most likely to press it is the one who should not (PRD §12).
       */}
    </section>
  );
}

export interface OfferData {
  matchId: string;
  topic: string;
  emotion: string;
  mood: string | null;
  expiresAt: string;
}

/**
 * The match offer — 60 second TTL, counted down visibly.
 *
 * The countdown is honest rather than urgent: it says how long the offer lasts
 * because the requester is waiting, not to pressure the listener into saying
 * yes. Declining is a full-size button, not a link in a corner.
 */
export function MatchOfferModal({
  offer,
  onAccept,
  onDecline,
  now = () => Date.now(),
}: {
  offer: OfferData;
  onAccept: (matchId: string) => void;
  onDecline: (matchId: string) => void;
  now?: () => number;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) onDecline(offer.matchId);
    };

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [now, offer.expiresAt, offer.matchId, onDecline]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="offer-heading"
      className="rounded-[var(--radius-curhat)] bg-[var(--color-tint-pink)] p-5"
    >
      <h2 id="offer-heading" className="text-lg font-black text-[var(--color-text)]">
        Ada yang butuh didengar
      </h2>

      <dl className="mt-3 flex flex-col gap-1 text-sm text-[var(--color-text)]">
        <div className="flex gap-2">
          <dt className="text-[var(--color-muted)]">Topik</dt>
          <dd>{offer.topic}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--color-muted)]">Yang dirasain</dt>
          <dd>{offer.emotion}</dd>
        </div>
        {offer.mood ? (
          <div className="flex gap-2">
            <dt className="text-[var(--color-muted)]">Mood</dt>
            <dd>{offer.mood}</dd>
          </div>
        ) : null}
      </dl>

      <p role="timer" aria-live="off" className="mt-4 text-sm text-[var(--color-text)] opacity-75">
        Tawaran ini berlaku <span className="font-bold tabular-nums">{secondsLeft}</span> detik
        lagi.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onAccept(offer.matchId)}
          className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-bold text-[var(--color-primary-fg)]"
        >
          Aku siap dengerin
        </button>
        <button
          type="button"
          onClick={() => onDecline(offer.matchId)}
          className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-border)] px-5 font-semibold text-[var(--color-text)]"
        >
          Lagi nggak bisa
        </button>
      </div>
    </div>
  );
}

export interface ListenerStats {
  sessionCount: number;
  feltHeardScore: number;
  helpfulScore: number;
  recentSessions: Array<{ startedAt: string; endedAt: string | null; minutes: number | null }>;
}

/**
 * The listener's own numbers.
 *
 * Their own, and nobody else's: there is no comparison, no rank, no percentile
 * (PRD §11). The framing is "here is what people said about being heard", not
 * "here is your performance".
 */
export function ListenerStatsPanel({ stats }: { stats: ListenerStats }) {
  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="text-base font-semibold text-[var(--color-text)]">
        Catatan kamu
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
          <dt className="text-sm text-[var(--color-muted)]">Sesi yang kamu temani</dt>
          <dd className="mt-1 text-2xl font-black tabular-nums text-[var(--color-text)]">
            {stats.sessionCount}
          </dd>
        </div>
        <div className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
          <dt className="text-sm text-[var(--color-muted)]">Bilang merasa didengar</dt>
          <dd className="mt-1 text-2xl font-black tabular-nums text-[var(--color-text)]">
            {stats.sessionCount === 0 ? '—' : `${Math.round(stats.feltHeardScore * 100)}%`}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Angka ini punya kamu sendiri. Nggak dibandingin sama siapa pun, dan nggak kelihatan ke
        orang lain.
      </p>
    </section>
  );
}
