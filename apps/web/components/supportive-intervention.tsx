'use client';

import { SafetyResourceCard, type SupportResource } from './safety';

/**
 * Supportive Intervention — E15-T10. DESIGN-REF §2.7, PRD §8, §15.1.
 *
 * The most carefully-worded screen in the product, and the one where what is
 * absent matters as much as what is present.
 *
 * **Never on this screen** (CLAUDE.md non-negotiable #2):
 *
 *  - any punishment. No block, no removal, no warning about consequences.
 *    Somebody who wrote something frightening is not in trouble;
 *  - any score, level, or risk classification. The system knows it evaluated
 *    this text; telling the person their "risk level" tells them they are being
 *    graded at the worst possible moment;
 *  - clinical framing. No diagnosis words, no "you appear to be experiencing".
 *
 * **Always on this screen**:
 *
 *  - short sentences. This is read by someone who may not be able to hold a
 *    long one;
 *  - a way out that is not an escape hatch — "Aku mengerti, tutup" is a normal
 *    button, not a greyed-out afterthought;
 *  - honesty when there are no verified resources. An empty list rendered as a
 *    heading with nothing under it is the worst possible outcome, so the
 *    server sends alternatives and this renders them plainly (PRD §15.2).
 */

export interface InterventionAlternative {
  label: string;
  /** A route, or one of the known in-app actions. */
  action: string;
}

export interface SupportiveInterventionData {
  message: string;
  resources: SupportResource[];
  usingFallback: boolean;
  alternatives: InterventionAlternative[];
}

/** Words this screen must never use. Asserted in the tests, not just here. */
export const FORBIDDEN_TONE: readonly RegExp[] = [
  /\bskor\b|\bscore\b/i,
  /\blevel\s*\d|\brisiko tinggi\b|\brisk\b/i,
  /\bdiagnos/i,
  /\bgangguan (jiwa|mental)\b/i,
  /\bmelanggar\b|\bpelanggaran\b|\bdiblokir\b|\bditangguhkan\b|\bsanksi\b/i,
  /\bkami pantau kamu\b/i,
];

export function SupportiveIntervention({
  data,
  onClose,
  onTalkToAi,
  onFindListener,
}: {
  data: SupportiveInterventionData;
  onClose: () => void;
  onTalkToAi: () => void;
  onFindListener: () => void;
}) {
  return (
    <section
      aria-labelledby="intervention-heading"
      className="mx-auto max-w-md rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
    >
      <h1
        id="intervention-heading"
        className="text-2xl leading-snug font-bold text-[var(--color-text)]"
      >
        Kamu nggak sendirian.
      </h1>

      {/*
       * The server writes this sentence (support-resources.service.ts) so web,
       * mobile and any future client cannot each invent their own wording for
       * the one screen where wording matters most.
       */}
      <p className="mt-4 text-base leading-relaxed text-[var(--color-text)]">{data.message}</p>

      {data.resources.length > 0 ? (
        <>
          <h2 className="mt-8 text-base font-semibold text-[var(--color-text)]">
            Kalau kamu mau ngomong sama orang sekarang
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {data.resources.map((resource) => (
              <li key={`${resource.name}-${resource.value}`}>
                <SafetyResourceCard resource={resource} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        // No verified list yet (E17-T12). Saying so is the only honest option:
        // a made-up number on this screen could send somebody to a dead line.
        <div className="mt-8 rounded-[var(--radius-curhat)] border border-dashed border-[var(--color-border)] p-4">
          <p className="text-base leading-relaxed text-[var(--color-text)]">
            Kami lagi nggak punya daftar nomor bantuan yang sudah kami pastikan benar, dan kami
            nggak mau ngasih nomor yang salah ke kamu.
          </p>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text)]">
            Kalau kamu dalam bahaya sekarang, hubungi layanan darurat di sekitarmu, atau bangunin
            satu orang yang kamu percaya — meski tengah malam.
          </p>
        </div>
      )}

      <h2 className="mt-8 text-base font-semibold text-[var(--color-text)]">
        Atau kalau belum siap
      </h2>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={onTalkToAi}
          className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 font-semibold text-[var(--color-text)]"
        >
          Ngobrol sama DONG AI
        </button>
        <button
          type="button"
          onClick={onFindListener}
          className="min-h-[var(--size-touch)] rounded-[var(--radius-action)] border border-[var(--color-brand)] px-5 font-semibold text-[var(--color-text)]"
        >
          Cari Listener sekarang
        </button>
      </div>

      {/*
       * A plain, full-width button — not a small "x" in a corner. Someone who
       * wants this screen gone should not have to hunt for the way out.
       */}
      <button
        type="button"
        onClick={onClose}
        className="mt-8 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
      >
        Aku mengerti, tutup
      </button>
    </section>
  );
}
