import {
  INTENT_VOCABULARY,
  MOOD_VOCABULARY,
  REACTIONS,
  REACTION_VOCABULARY,
  type Intent,
  type Mood,
  type Reaction,
} from '@curhat/types';
import { Pressable, ScrollView, Text, View, type ViewProps } from 'react-native';

import { TOUCH_TARGET } from '../lib/tokens';

/**
 * Core mobile components — E16-T04. DESIGN-REF §5, PRD §23.1.
 *
 * Three rules run through all of them:
 *
 *  - **every glyph carries a spoken name.** The vocabulary comes from
 *    `@curhat/types`, the same source the web uses, so a mood is announced
 *    identically on both platforms;
 *  - **nothing sets `allowFontScaling={false}`.** React Native honours the OS
 *    text size by default and turning it off is a one-word change that quietly
 *    breaks the phone for the people who need it most;
 *  - **44dp minimum on anything tappable** (PRD §23.1), including the small
 *    reaction buttons.
 */

export function Screen({ children, ...props }: ViewProps) {
  return (
    <View className="flex-1 bg-bg px-gutter" {...props}>
      {children}
    </View>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" className="text-2xl font-bold text-text">
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return <Text className={`text-base leading-6 ${muted ? 'text-muted' : 'text-text'}`}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: TOUCH_TARGET }}
      className={`items-center justify-center rounded-action bg-primary px-6 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <Text className="text-base font-semibold text-primary-fg">{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={{ minHeight: TOUCH_TARGET }}
      className="items-center justify-center rounded-action border border-brand px-6"
    >
      <Text className="text-base font-semibold text-text">{label}</Text>
    </Pressable>
  );
}

export function MoodChip({ mood }: { mood: Mood }) {
  const entry = MOOD_VOCABULARY[mood];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={entry.a11yLabel}
      className="flex-row items-center gap-1 rounded-chip border border-border bg-surface px-3 py-1"
    >
      <Text accessibilityElementsHidden>{entry.glyph}</Text>
      <Text accessibilityElementsHidden className="text-sm text-text">
        {mood.replace('_', ' ')}
      </Text>
    </View>
  );
}

export function IntentBadge({ intent }: { intent: Intent }) {
  const entry = INTENT_VOCABULARY[intent];
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={entry.a11yLabel}
      className="flex-row items-center gap-1 rounded-chip border border-border bg-surface px-3 py-1"
    >
      <Text accessibilityElementsHidden>{entry.glyph}</Text>
    </View>
  );
}

/**
 * Six empathy words, never a like.
 *
 * The accessible name carries the state as well as the word, because a filled
 * background says nothing to a screen reader and `selected` alone announces
 * "selected" without saying what.
 */
export function ReactionBar({
  counts,
  mine,
  onToggle,
  showCounts = false,
}: {
  counts: Partial<Record<Reaction, number>>;
  mine: readonly Reaction[];
  onToggle: (reaction: Reaction) => void;
  showCounts?: boolean;
}) {
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Reaksi" className="flex-row flex-wrap gap-2">
      {REACTIONS.map((reaction) => {
        const entry = REACTION_VOCABULARY[reaction];
        const given = mine.includes(reaction);
        const count = counts[reaction] ?? 0;

        return (
          <Pressable
            key={reaction}
            accessibilityRole="button"
            accessibilityState={{ selected: given }}
            accessibilityLabel={
              showCounts
                ? `${entry.a11yLabel}${given ? ', sudah kamu beri' : ''}, ${count} orang`
                : `${entry.a11yLabel}${given ? ', sudah kamu beri' : ''}`
            }
            onPress={() => onToggle(reaction)}
            style={{ minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET }}
            className={`items-center justify-center rounded-chip border px-3 ${
              given ? 'border-primary bg-surface-alt' : 'border-border bg-surface'
            }`}
          >
            <Text accessibilityElementsHidden>{entry.glyph}</Text>
            {showCounts && count > 0 ? (
              <Text accessibilityElementsHidden className="text-xs text-muted">
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export interface CurhatCardProps {
  postId: string;
  title: string | null;
  excerpt: string;
  mood: Mood;
  intent: Intent;
  categoryName: string;
  authorLabel: string;
  isAnonymous: boolean;
  replyCount: number;
  createdAtLabel: string;
  variant?: 'default' | 'butuh-didengar' | 'anonymous' | 'held';
  onOpen?: (postId: string) => void;
}

const VARIANT_NOTICE: Partial<Record<NonNullable<CurhatCardProps['variant']>, string>> = {
  'butuh-didengar': 'Belum banyak yang balas. Kalau kamu punya waktu sebentar.',
  held: 'Curhatmu kami tinjau dulu sebentar ya. Baru kamu yang bisa lihat ini.',
};

export function CurhatCard({
  postId,
  title,
  excerpt,
  mood,
  intent,
  categoryName,
  authorLabel,
  isAnonymous,
  replyCount,
  createdAtLabel,
  variant = 'default',
  onOpen,
}: CurhatCardProps) {
  const notice = VARIANT_NOTICE[variant];

  return (
    <View
      accessible={false}
      className={`rounded-curhat border bg-surface p-4 ${
        variant === 'butuh-didengar'
          ? 'border-l-4 border-border border-l-accent-amber'
          : variant === 'held'
            ? 'border-dashed border-muted'
            : 'border-border'
      }`}
    >
      <Text className="text-sm text-muted">
        {isAnonymous ? `Ditulis anonim, kode ${authorLabel}` : authorLabel} · {categoryName} ·{' '}
        {createdAtLabel}
      </Text>

      <Text accessibilityRole="header" className="mt-2 text-base font-semibold text-text">
        {title ?? excerpt.slice(0, 60)}
      </Text>

      <Text className="mt-1 text-sm leading-5 text-text">{excerpt}</Text>

      <View className="mt-3 flex-row flex-wrap gap-2">
        <MoodChip mood={mood} />
        <IntentBadge intent={intent} />
      </View>

      {notice ? <Text className="mt-3 text-sm text-text">{notice}</Text> : null}

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          {replyCount === 0 ? 'Belum ada balasan' : `${replyCount} balasan`}
        </Text>

        {onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Baca curhat: ${title ?? excerpt.slice(0, 40)}`}
            onPress={() => onOpen(postId)}
            style={{ minHeight: TOUCH_TARGET }}
            className="items-center justify-center rounded-action border border-brand px-4"
          >
            <Text accessibilityElementsHidden className="text-sm font-semibold text-text">
              Baca
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string | null;
  onAction?: () => void;
}) {
  return (
    <View className="items-center rounded-curhat border border-dashed border-border bg-surface p-6">
      <Text className="text-center text-base font-semibold text-text">{title}</Text>
      <Text className="mt-1.5 text-center text-sm text-muted">{body}</Text>
      {actionLabel && onAction ? (
        <View className="mt-4">
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  return (
    <Text accessibilityLiveRegion="polite" className="min-h-5 text-sm text-danger">
      {message ?? ''}
    </Text>
  );
}

export function Loading({ label = 'Sebentar ya…' }: { label?: string }) {
  return (
    <View className="p-6">
      <Text accessibilityLiveRegion="polite" className="text-center text-sm text-muted">
        {label}
      </Text>
    </View>
  );
}

export function ScreenScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-gutter py-6 gap-4"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
