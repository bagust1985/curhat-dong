import {
  INTENT_LABELS,
  INTENT_VOCABULARY,
  MOOD_LABELS,
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
 * Card elevation — E18-T06.
 *
 * The web lifts cards on a rose-tinted shadow. React Native cannot tint an
 * Android shadow below API 28, and on the plum ground a coloured shadow is
 * almost invisible anyway, so the depth here comes from the surface sitting on
 * the ground plus a shallow neutral lift. Cards lose their hairline for the
 * same reason they did on the web: a column of identically outlined boxes read
 * as one list rather than as separate stories.
 */
const LIFT = {
  elevation: 2,
  shadowColor: '#000000',
  shadowOpacity: 0.22,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
} as const;

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
    <Text accessibilityRole="header" className="text-[26px] font-black text-text">
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
      <Text className="text-base font-bold text-primary-fg">{label}</Text>
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
      className="items-center justify-center rounded-action border-2 border-brand px-6"
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
      className="flex-row items-center gap-1.5 rounded-chip bg-tint-pink px-3 py-1"
    >
      <Text accessibilityElementsHidden>{entry.glyph}</Text>
      {/*
        MOOD_LABELS, not the enum key. This used to render
        `mood.replace('_', ' ')`, which put an identifier on screen — the
        shared label table exists so the phone and the browser call a mood the
        same thing, and deriving copy from a key quietly opts out of it.
      */}
      <Text accessibilityElementsHidden className="text-sm font-semibold text-text">
        {MOOD_LABELS[mood]}
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
      className="flex-row items-center gap-1.5 rounded-chip border border-border px-3 py-1"
    >
      <Text accessibilityElementsHidden>{entry.glyph}</Text>
      {/*
        The label, which was missing entirely — this badge rendered a bare
        glyph. What the author is asking for is the thing a reader decides on,
        and leaving it as an emoji meant a sighted reader had to already know
        that an ear means "cuma mau didengar".
      */}
      <Text accessibilityElementsHidden className="text-sm text-text">
        {INTENT_LABELS[intent]}
      </Text>
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
              given ? 'border-primary bg-tint-pink' : 'border-border bg-surface'
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
      style={variant === 'held' ? undefined : LIFT}
      className={`rounded-curhat bg-surface p-[18px] ${
        variant === 'butuh-didengar'
          ? // The amber edge plus the notice below it — the accent is never the
            // only thing that marks this variant.
            'border-l-4 border-l-accent-amber'
          : variant === 'held'
            ? 'border border-dashed border-muted'
            : ''
      }`}
    >
      {/*
        Mood and intent lead; the byline follows. What a reader decides on is
        how this person feels and what they are asking for — the alias and the
        timestamp are the footnote, and they used to be the first thing said.
      */}
      <View className="flex-row flex-wrap gap-2">
        <MoodChip mood={mood} />
        <IntentBadge intent={intent} />
      </View>

      <Text className="mt-3 text-xs text-muted">
        {isAnonymous ? `Ditulis anonim, kode ${authorLabel}` : authorLabel} · {categoryName} ·{' '}
        {createdAtLabel}
      </Text>

      <Text accessibilityRole="header" className="mt-2 text-[17px] font-bold text-text">
        {title ?? excerpt.slice(0, 60)}
      </Text>

      <Text className="mt-1.5 text-sm leading-6 text-text">{excerpt}</Text>

      {notice ? (
        <Text
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
            variant === 'held' ? 'bg-surface-alt text-muted' : 'bg-tint-amber text-text'
          }`}
        >
          {notice}
        </Text>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between border-t border-border pt-3">
        <Text className="text-xs text-muted">
          {replyCount === 0 ? 'Belum ada balasan' : `${replyCount} balasan`}
        </Text>

        {onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Baca curhat: ${title ?? excerpt.slice(0, 40)}`}
            onPress={() => onOpen(postId)}
            style={{ minHeight: TOUCH_TARGET }}
            className="items-center justify-center rounded-action border-2 border-brand px-5"
          >
            <Text accessibilityElementsHidden className="text-sm font-bold text-text">
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
    <View className="items-center rounded-curhat border border-dashed border-border bg-surface-alt p-7">
      <Text className="text-center text-base font-bold text-text">{title}</Text>
      <Text className="mt-2 text-center text-sm leading-6 text-muted">{body}</Text>
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
