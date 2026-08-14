'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Intent, Mood } from '@curhat/types';

import { ApiError, api } from '../lib/api';
import { EMPTY_DRAFT, clearDraft, loadDraft, saveDraft, type Draft } from '../lib/draft';
import { PERSONAL_DATA_WARNING, detectPersonalData } from '../lib/personal-data';
import { CategorySheet, IntentSelector, MoodPicker, type CategoryOption } from './chips';
import {
  SupportiveIntervention,
  type SupportiveInterventionData,
} from './supportive-intervention';

/**
 * Create curhat — E15-T09. DESIGN-REF §2.6, PRD §7.
 *
 * Three things here are load-bearing:
 *
 *  1. **The doxxing warning informs, it does not block.** It appears inline
 *     while typing and the submit button stays live underneath it. Someone may
 *     have a reason to include a detail we flagged, and this product does not
 *     overrule a person about their own story;
 *  2. **The draft is saved locally as they type**, so a closed tab does not
 *     cost somebody the paragraph they finally managed to write;
 *  3. **The three submit outcomes are all real screens**, not one toast. A held
 *     post says so plainly, and a Level 3 response opens the supportive
 *     intervention rather than an error.
 */

export type SubmitOutcome =
  | { kind: 'idle' }
  | { kind: 'published'; postId: string }
  | { kind: 'held'; postId: string }
  | { kind: 'intervention'; data: SupportiveInterventionData; postId: string };

interface CreateResponse {
  postId: string;
  status: 'published' | 'held';
  intervention?: SupportiveInterventionData;
  personalDataWarning?: string;
}

export function CreateCurhat({
  categories,
  initialMood = null,
  onClose,
  onPublished,
  onOpenAi,
  onFindListener,
}: {
  categories: CategoryOption[];
  /**
   * Pre-selected mood, from the mood strip on `/home` (E18-T01). A saved draft
   * always wins over it — somebody returning to a half-written curhat must not
   * have it replaced because they tapped a mood on the way in.
   */
  initialMood?: Mood | null;
  onClose: () => void;
  onPublished: (postId: string) => void;
  onOpenAi: () => void;
  onFindListener: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [restored, setRestored] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome>({ kind: 'idle' });
  const firstLoad = useRef(true);

  useEffect(() => {
    const stored = loadDraft();
    if (stored) {
      setDraft(stored);
      setRestored(true);
    } else if (initialMood) {
      setDraft({ ...EMPTY_DRAFT, mood: initialMood });
    }
    firstLoad.current = false;
    // Mount only. `initialMood` is read here on purpose and left out of the
    // deps: re-running this on a prop change would overwrite whatever the
    // person has since chosen, which is the opposite of seeding a draft.

  }, []);

  useEffect(() => {
    if (firstLoad.current) return;
    saveDraft(draft);
  }, [draft]);

  const hints = useMemo(
    () => detectPersonalData(`${draft.title}\n${draft.body}`),
    [draft.title, draft.body],
  );

  const update = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const ready =
    draft.body.trim().length >= 20 && draft.categorySlug !== null && draft.mood !== null &&
    draft.intent !== null;

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
          // True once the inline warning has been seen and accepted. The server
          // holds the post otherwise (posts.service.ts).
          acknowledgedPersonalDataWarning: acknowledged || hints.length === 0,
        },
      });

      // Submitted: the local copy has no reason to exist any more.
      clearDraft();

      if (data.intervention) {
        setOutcome({ kind: 'intervention', data: data.intervention, postId: data.postId });
      } else if (data.status === 'held') {
        setOutcome({ kind: 'held', postId: data.postId });
      } else {
        setOutcome({ kind: 'published', postId: data.postId });
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'CONTENT_BLOCKED') {
        setError('Curhat ini nggak bisa dikirim karena melanggar aturan komunitas.');
      } else if (cause instanceof ApiError && cause.code === 'RATE_LIMITED') {
        setError('Kamu baru aja posting. Tarik napas sebentar, lalu coba lagi ya.');
      } else {
        setError('Belum kekirim. Ceritamu masih tersimpan di sini kok — coba lagi ya.');
      }
    } finally {
      setPending(false);
    }
  }, [acknowledged, draft, hints.length]);

  if (outcome.kind === 'intervention') {
    return (
      <SupportiveIntervention
        data={outcome.data}
        onClose={onClose}
        onTalkToAi={onOpenAi}
        onFindListener={onFindListener}
      />
    );
  }

  if (outcome.kind === 'held') {
    return (
      <section
        aria-labelledby="held-heading"
        className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <h2 id="held-heading" className="text-xl font-bold text-[var(--color-text)]">
          Curhatmu kami tinjau dulu sebentar ya
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
          Buat sekarang cuma kamu yang bisa lihat. Kalau aman, nanti muncul di feed. Ini bukan
          hukuman — kadang sistem kami cuma mau memastikan.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
        >
          Aku ngerti
        </button>
      </section>
    );
  }

  if (outcome.kind === 'published') {
    return (
      <section
        aria-labelledby="published-heading"
        className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <h2 id="published-heading" className="text-xl font-bold text-[var(--color-text)]">
          Udah kekirim 🤍
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
          Sekarang ceritamu bisa dibaca orang lain. Nggak harus nungguin balasan — kamu boleh
          tutup ini dan balik lagi nanti.
        </p>
        <button
          type="button"
          onClick={() => onPublished(outcome.postId)}
          className="mt-6 min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
        >
          Lihat curhatku
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="create-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="create-heading" className="text-xl font-bold text-[var(--color-text)]">
          Hari ini kamu mau cerita apa?
        </h2>
        {restored ? (
          <p role="status" className="mt-2 text-sm text-[var(--color-muted)]">
            Tulisanmu yang belum kekirim kami simpan. Lanjut dari sini aja.
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="curhat-title"
          className="block text-sm font-semibold text-[var(--color-text)]"
        >
          Judul <span className="font-normal text-[var(--color-muted)]">(opsional)</span>
        </label>
        <input
          id="curhat-title"
          value={draft.title}
          maxLength={160}
          onChange={(event) => update('title', event.target.value)}
          className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--color-text)]"
        />
      </div>

      <div>
        <label
          htmlFor="curhat-body"
          className="block text-sm font-semibold text-[var(--color-text)]"
        >
          Ceritamu
        </label>
        <textarea
          id="curhat-body"
          value={draft.body}
          rows={8}
          maxLength={5000}
          onChange={(event) => update('body', event.target.value)}
          aria-describedby="curhat-body-help"
          className="mt-2 w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 leading-relaxed text-[var(--color-text)]"
        />
        <p id="curhat-body-help" className="mt-1 text-sm text-[var(--color-muted)]">
          Nggak harus rapi. Minimal 20 huruf biar ada yang bisa dibales.
        </p>
      </div>

      {/*
       * Inline, above the submit button, and never in the way of it. The
       * acknowledge checkbox is what the server reads; leaving it unticked does
       * not stop the post, it just means the post gets held for review.
       */}
      {hints.length > 0 ? (
        <div
          role="status"
          className="rounded-[var(--radius-curhat)] border border-l-4 border-[var(--color-border)] border-l-[var(--color-accent-amber)] bg-[var(--color-surface)] p-4"
        >
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {PERSONAL_DATA_WARNING}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Kami nemu: {hints.map((hint) => hint.label).join(', ')}. Kamu tetap boleh lanjut —
            ini keputusanmu.
          </p>
          <label className="mt-3 flex min-h-[var(--size-touch)] items-start gap-3 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1 size-5"
            />
            <span>Aku ngerti, dan tetap mau kirim.</span>
          </label>
        </div>
      ) : null}

      <div>
        <span className="block text-sm font-semibold text-[var(--color-text)]">Topik</span>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-2 min-h-[var(--size-touch)] w-full rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-left text-[var(--color-text)]"
        >
          {categories.find((item) => item.slug === draft.categorySlug)?.name ?? 'Pilih topik'}
        </button>
        {sheetOpen ? (
          <div className="mt-2">
            <CategorySheet
              categories={categories}
              value={draft.categorySlug}
              onChange={(slug) => {
                update('categorySlug', slug);
                setSheetOpen(false);
              }}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        ) : null}
      </div>

      <MoodPicker
        value={(draft.mood as Mood | null) ?? null}
        onChange={(mood) => update('mood', mood)}
      />
      <IntentSelector
        value={(draft.intent as Intent | null) ?? null}
        onChange={(intent) => update('intent', intent)}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-[var(--color-text)]">Pengaturan</legend>

        <label className="flex min-h-[var(--size-touch)] items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={draft.anonymityMode === 'anonymous'}
            onChange={(event) =>
              update('anonymityMode', event.target.checked ? 'anonymous' : 'alias')
            }
            className="size-5"
          />
          <span>
            Kirim sebagai anonim
            <span className="block text-[var(--color-muted)]">
              Kode acak per curhat, bukan nama samaranmu.
            </span>
          </span>
        </label>

        <label className="flex min-h-[var(--size-touch)] items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={draft.allowComments}
            onChange={(event) => update('allowComments', event.target.checked)}
            className="size-5"
          />
          <span>Izinkan orang membalas</span>
        </label>

        <label className="flex min-h-[var(--size-touch)] items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={draft.requestListener}
            onChange={(event) => update('requestListener', event.target.checked)}
            className="size-5"
          />
          <span>Sekalian cariin listener buat aku</span>
        </label>
      </fieldset>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--color-danger)]">
        {error}
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => void submit()}
          className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
        >
          {pending ? 'Lagi dikirim…' : 'Kirim curhat'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Simpan dulu, tutup
        </button>
      </div>
    </section>
  );
}
