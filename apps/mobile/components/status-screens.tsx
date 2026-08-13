import { Text, View } from 'react-native';

import { Body, Heading, PrimaryButton, SecondaryButton } from './ui';

/**
 * Offline, maintenance and force-update — E16-T11.
 *
 * None of these is an error screen with a stack trace on it. Somebody who opens
 * this app at 2am and meets "Network request failed" learns that the thing they
 * reached for is broken; the wording below says what happened and what they can
 * still do.
 */

export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="rounded-curhat border border-border bg-surface p-4"
    >
      <Text className="text-sm font-semibold text-text">Koneksinya lagi putus-putus.</Text>
      <Text className="mt-1 text-sm text-muted">
        Yang udah kebuka tetap bisa dibaca. Sisanya nunggu sinyal balik.
      </Text>
      <View className="mt-3">
        <SecondaryButton label="Coba lagi" onPress={onRetry} />
      </View>
    </View>
  );
}

/**
 * Maintenance — the server said 503.
 *
 * Blocks nothing permanently and offers a retry, because a maintenance window
 * ends and the app should come back by itself when it does.
 */
export function MaintenanceScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 justify-center bg-bg px-gutter">
      <Heading>Lagi ada perbaikan sebentar</Heading>
      <Body muted>
        Kami lagi benerin sesuatu di belakang layar. Nggak lama kok — coba lagi beberapa menit
        lagi ya.
      </Body>
      <View className="mt-6">
        <PrimaryButton label="Coba lagi" onPress={onRetry} />
      </View>
    </View>
  );
}

/**
 * Force update — only when the installed build is genuinely too old.
 *
 * The one screen in the app that does block. It appears when the server says the
 * installed version is below the minimum it still supports, never merely because
 * a newer build exists (`lib/app-status.ts`).
 */
export function ForceUpdateScreen({ onOpenStore }: { onOpenStore: () => void }) {
  return (
    <View className="flex-1 justify-center bg-bg px-gutter">
      <Heading>Versinya perlu diperbarui</Heading>
      <Body muted>
        Versi aplikasi yang kamu pakai udah nggak bisa nyambung ke layanan kami dengan aman.
        Perbarui dulu ya — ceritamu tetap ada, nggak ada yang hilang.
      </Body>
      <View className="mt-6">
        <PrimaryButton label="Perbarui aplikasi" onPress={onOpenStore} />
      </View>
    </View>
  );
}

/**
 * The one-line error surface.
 *
 * A `Toast` rather than an alert dialog: an alert steals focus and has to be
 * dismissed, which for "your reply did not send" is more interruption than the
 * problem deserves.
 */
export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className="absolute bottom-24 left-gutter right-gutter rounded-curhat border border-border bg-surface p-4"
    >
      <Text className="text-sm text-text">{message}</Text>
      <View className="mt-2 self-end">
        <SecondaryButton label="Tutup" onPress={onDismiss} />
      </View>
    </View>
  );
}
