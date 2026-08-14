'use client';

import type { ReactNode } from 'react';

import {
  AVATAR_PRESETS,
  CONSENT_ITEMS,
  REASON_OPTIONS,
  SAFETY_RULES,
  STEP_TITLES,
  WELCOME_COPY,
  type ConsentType,
  type ReasonOption,
} from '../lib/onboarding';
import { Input } from './ui';

/**
 * Onboarding steps — E15-T07. DESIGN-REF §2.3, PRD §5, §25.3.
 *
 * Presentational; the page owns the state and the submit. Each step is exported
 * separately so its rule can be tested on its own — "nothing pre-checked" is a
 * claim about the consent step, not about a seven-screen flow.
 */

export function StepShell({
  step,
  total,
  title,
  children,
  onBack,
  footer,
}: {
  step: number;
  total: number;
  title: string;
  children: ReactNode;
  onBack?: (() => void) | undefined;
  footer: ReactNode;
}) {
  return (
    <section aria-labelledby="onboarding-heading" className="flex min-h-screen flex-col">
      <header className="pt-8">
        {/*
         * A progress bar that is also readable, not only visible: a screen
         * reader user should know they are on 3 of 7 without counting dots.
         */}
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
          aria-valuetext={`Langkah ${step + 1} dari ${total}`}
          className="flex gap-1"
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`h-1 flex-1 rounded-full ${
                index <= step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
              }`}
            />
          ))}
        </div>

        <p className="mt-3 text-sm text-[var(--color-muted)] tabular-nums">
          Langkah {step + 1} dari {total}
        </p>

        <h1
          id="onboarding-heading"
          className="mt-2 text-[26px] leading-tight font-black text-balance text-[var(--color-text)]"
        >
          {title}
        </h1>
      </header>

      <div className="flex-1 py-6">{children}</div>

      <footer className="flex flex-col gap-3 pb-10">
        {footer}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[var(--size-touch)] text-sm text-[var(--color-muted)] underline underline-offset-4"
          >
            Kembali
          </button>
        ) : null}
      </footer>
    </section>
  );
}

export function WelcomeStep() {
  return (
    <div>
      <p className="text-lg leading-relaxed text-[var(--color-text)]">{WELCOME_COPY}</p>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
        Sebentar aja — beberapa pertanyaan biar kami tahu cara nemenin kamu. Sebagian boleh
        dilewati.
      </p>
    </div>
  );
}

export function ReasonStep({
  value,
  onChange,
}: {
  value: ReasonOption['value'] | null;
  onChange: (value: ReasonOption['value']) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Alasan pakai CURHAT DONG" className="flex flex-col gap-3">
      {REASON_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-[var(--size-touch)] rounded-[var(--radius-curhat)] border px-4 text-left font-semibold ${
            value === option.value
              ? 'border-[var(--color-primary)] bg-[var(--color-tint-pink)] font-bold text-[var(--color-text)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface TopicOption {
  slug: string;
  name: string;
  icon: string | null;
}

export function TopicsStep({
  topics,
  selected,
  onToggle,
}: {
  topics: readonly TopicOption[];
  selected: readonly string[];
  onToggle: (slug: string) => void;
}) {
  if (topics.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Daftar topiknya lagi nggak bisa dimuat. Nggak apa-apa — langkah ini boleh dilewati.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((topic) => {
        const active = selected.includes(topic.slug);
        return (
          <button
            key={topic.slug}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(topic.slug)}
            className={`min-h-[var(--size-touch)] rounded-[var(--radius-chip)] border px-4 text-sm font-semibold ${
              active
                ? 'border-[var(--color-primary)] bg-[var(--color-tint-pink)] font-bold text-[var(--color-text)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
            }`}
          >
            {topic.icon ? <span aria-hidden="true">{topic.icon} </span> : null}
            {topic.name}
          </button>
        );
      })}
    </div>
  );
}

export function AliasStep({
  alias,
  onAlias,
  suggestions,
  onPickSuggestion,
  availability,
  avatar,
  onAvatar,
}: {
  alias: string;
  onAlias: (value: string) => void;
  suggestions: readonly string[];
  onPickSuggestion: (value: string) => void;
  availability: { checking: boolean; available: boolean | null; reason: string | null };
  avatar: string | null;
  onAvatar: (id: string) => void;
}) {
  const status = availability.checking
    ? 'Lagi dicek…'
    : availability.available === true
      ? 'Nama ini bisa dipakai.'
      : availability.available === false
        ? (availability.reason ?? 'Nama itu sudah dipakai. Coba yang lain ya.')
        : '';

  return (
    <div>
      <label
        htmlFor="onboarding-alias"
        className="block text-sm font-semibold text-[var(--color-text)]"
      >
        Nama samaran
      </label>
      <Input
        id="onboarding-alias"
        value={alias}
        onChange={(event) => onAlias(event.target.value)}
        aria-describedby="onboarding-alias-status"
        maxLength={24}
        className="mt-2"
      />
      <p
        id="onboarding-alias-status"
        role="status"
        aria-live="polite"
        className="mt-2 min-h-5 text-sm text-[var(--color-muted)]"
      >
        {status}
      </p>

      <p className="mt-4 text-sm text-[var(--color-muted)]">Atau pakai salah satu ini:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPickSuggestion(suggestion)}
            className="min-h-[var(--size-touch)] rounded-[var(--radius-chip)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)]"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <h2 className="mt-8 text-base font-semibold text-[var(--color-text)]">Avatar</h2>
      <div role="radiogroup" aria-label="Pilih avatar" className="mt-3 flex flex-wrap gap-2">
        {AVATAR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={avatar === preset.id}
            aria-label={preset.label}
            onClick={() => onAvatar(preset.id)}
            className={`size-[var(--size-touch)] rounded-full border text-xl ${
              avatar === preset.id
                ? 'border-[var(--color-primary)] bg-[var(--color-tint-pink)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)]'
            }`}
          >
            <span aria-hidden="true">{preset.glyph}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConsentStep({
  granted,
  onToggle,
}: {
  granted: Partial<Record<ConsentType, boolean>>;
  onToggle: (type: ConsentType, value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {CONSENT_ITEMS.map((item) => (
        <div
          key={item.type}
          className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              // Never defaulted to true. A pre-ticked box is not consent
              // (PRD §25.3), and `granted` starts empty for that reason.
              checked={granted[item.type] === true}
              onChange={(event) => onToggle(item.type, event.target.checked)}
              className="mt-1 size-5"
            />
            <span>
              <span className="block font-semibold text-[var(--color-text)]">
                {item.title}
                <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                  {item.required ? 'Wajib' : 'Opsional'}
                </span>
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-[var(--color-muted)]">
                {item.body}
              </span>
            </span>
          </label>

          {item.refusalNote ? (
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
              {item.refusalNote}
            </p>
          ) : null}

          {item.links ? (
            <ul className="mt-2 flex flex-wrap gap-4">
              {item.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-[var(--color-text)] underline underline-offset-4"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SafetyRulesStep({
  acknowledged,
  onAcknowledge,
}: {
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        Ini kesepakatan soal cara kita memperlakukan satu sama lain — beda dari persetujuan data
        di langkah sebelumnya.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {SAFETY_RULES.map((rule) => (
          <li
            key={rule}
            className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-4 text-sm leading-relaxed text-[var(--color-text)] shadow-[var(--shadow-card)]"
          >
            {rule}
          </li>
        ))}
      </ul>

      <label className="mt-6 flex min-h-[var(--size-touch)] items-start gap-3 text-sm text-[var(--color-text)]">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledge(event.target.checked)}
          className="mt-1 size-5"
        />
        <span>Aku ngerti dan siap jaga ruang ini.</span>
      </label>
    </div>
  );
}

export function stepTitle(step: number): string {
  return STEP_TITLES[step] ?? '';
}
