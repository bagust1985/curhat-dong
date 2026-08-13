'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from '../../../lib/api';
import {
  SKIPPABLE_STEPS,
  STEP_TITLES,
  consentSatisfied,
  type ConsentType,
  type ReasonOption,
} from '../../../lib/onboarding';
import { useSession } from '../../../lib/session';
import {
  AliasStep,
  ConsentStep,
  ReasonStep,
  SafetyRulesStep,
  StepShell,
  TopicsStep,
  WelcomeStep,
  type TopicOption,
} from '../../../components/onboarding';

/**
 * `/onboarding` — E15-T07. DESIGN-REF §2.3, PRD §5, §25.3.
 *
 * Seven steps, one submit. Everything is held in memory until the last screen
 * because a half-finished onboarding should not leave a half-created account:
 * the API completes it atomically (onboarding.service.ts), and mirroring that
 * here means a person who closes the tab at step 4 has told us nothing.
 *
 * The consent answers are sent for all three types, granted or refused. "They
 * said no" is as much a compliance record as "they said yes" (PRD §25.3).
 */

const TOTAL_STEPS = STEP_TITLES.length;

export default function OnboardingPage() {
  const router = useRouter();
  const { reload } = useSession();

  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<ReasonOption['value'] | null>(null);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [alias, setAlias] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [availability, setAvailability] = useState<{
    checking: boolean;
    available: boolean | null;
    reason: string | null;
  }>({ checking: false, available: null, reason: null });
  const [granted, setGranted] = useState<Partial<Record<ConsentType, boolean>>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api<TopicOption[]>('/categories');
        setTopics(data);
      } catch {
        // Step 3 is skippable; an empty list says so rather than blocking.
      }
      try {
        const { data } = await api<Array<{ alias: string; available: boolean }>>(
          '/onboarding/alias/suggestions',
        );
        setSuggestions(data.filter((item) => item.available).map((item) => item.alias));
      } catch {
        setSuggestions([]);
      }
    })();
  }, []);

  // Availability check, debounced. Typing a name should not fire a request per
  // keystroke, and the answer for a half-typed alias is noise anyway.
  useEffect(() => {
    const trimmed = alias.trim();
    if (trimmed.length === 0) {
      setAvailability({ checking: false, available: null, reason: null });
      return;
    }

    setAvailability({ checking: true, available: null, reason: null });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api<{ available: boolean; reason?: string }>(
            '/onboarding/alias/check',
            { query: { alias: trimmed } },
          );
          setAvailability({
            checking: false,
            available: data.available,
            reason: data.reason ?? null,
          });
        } catch {
          setAvailability({ checking: false, available: null, reason: null });
        }
      })();
    }, 400);

    return () => clearTimeout(timer);
  }, [alias]);

  const submit = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await api('/onboarding', {
        method: 'POST',
        body: {
          isAdult: true,
          // All three, answered as they were answered.
          consents: [
            { consentType: 'tos_privacy', granted: granted.tos_privacy === true },
            {
              consentType: 'sensitive_processing',
              granted: granted.sensitive_processing === true,
            },
            { consentType: 'analytics', granted: granted.analytics === true },
          ],
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(avatar ? { avatar } : {}),
          ...(reason ? { reason } : {}),
          ...(selectedTopics.length > 0 ? { topics: selectedTopics } : {}),
        },
      });
      await reload();
      router.push('/home');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'ALIAS_TAKEN') {
        setError('Nama samaran itu keburu diambil orang. Pilih yang lain ya.');
        setStep(3);
      } else if (cause instanceof ApiError && cause.code === 'AGE_GATE_COOLDOWN') {
        setError('Kamu baru saja mencoba. Coba lagi besok ya.');
      } else {
        setError('Belum berhasil disimpan. Coba lagi sebentar lagi ya.');
      }
    } finally {
      setPending(false);
    }
  }, [alias, avatar, granted, reason, reload, router, selectedTopics]);

  const next = useCallback(() => setStep((value) => Math.min(value + 1, TOTAL_STEPS - 1)), []);
  const back = useCallback(() => setStep((value) => Math.max(value - 1, 0)), []);

  const canContinue =
    step === 4 ? consentSatisfied(granted) : step === 5 ? acknowledged : true;

  const primaryLabel = step === TOTAL_STEPS - 1 ? 'Masuk ke beranda' : 'Lanjut';

  const footer = (
    <>
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-[var(--color-danger)]">
        {error}
      </p>
      <button
        type="button"
        disabled={!canContinue || pending}
        onClick={() => (step === TOTAL_STEPS - 1 ? void submit() : next())}
        className="min-h-[var(--size-touch)] w-full rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] disabled:opacity-60"
      >
        {pending ? 'Sebentar ya…' : primaryLabel}
      </button>

      {SKIPPABLE_STEPS.includes(step) ? (
        <button
          type="button"
          onClick={next}
          className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
        >
          Lewati dulu
        </button>
      ) : null}
    </>
  );

  return (
    <main className="mx-auto max-w-md px-[var(--spacing-gutter)]">
      <StepShell
        step={step}
        total={TOTAL_STEPS}
        title={STEP_TITLES[step] ?? ''}
        onBack={step > 0 ? back : undefined}
        footer={footer}
      >
        {step === 0 ? <WelcomeStep /> : null}
        {step === 1 ? <ReasonStep value={reason} onChange={setReason} /> : null}
        {step === 2 ? (
          <TopicsStep
            topics={topics}
            selected={selectedTopics}
            onToggle={(slug) =>
              setSelectedTopics((current) =>
                current.includes(slug)
                  ? current.filter((item) => item !== slug)
                  : [...current, slug],
              )
            }
          />
        ) : null}
        {step === 3 ? (
          <AliasStep
            alias={alias}
            onAlias={setAlias}
            suggestions={suggestions}
            onPickSuggestion={setAlias}
            availability={availability}
            avatar={avatar}
            onAvatar={setAvatar}
          />
        ) : null}
        {step === 4 ? (
          <ConsentStep
            granted={granted}
            onToggle={(type, value) => setGranted((current) => ({ ...current, [type]: value }))}
          />
        ) : null}
        {step === 5 ? (
          <SafetyRulesStep acknowledged={acknowledged} onAcknowledge={setAcknowledged} />
        ) : null}
        {step === 6 ? (
          <div>
            <p className="text-lg leading-relaxed text-[var(--color-text)]">
              Udah siap. Selamat datang di CURHAT DONG 🤍
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
              Kalau belum mau cerita apa-apa dulu, nggak apa-apa. Baca-baca aja juga boleh.
            </p>
          </div>
        ) : null}
      </StepShell>
    </main>
  );
}
