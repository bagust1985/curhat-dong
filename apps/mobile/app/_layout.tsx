import Constants from 'expo-constants';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Linking, useColorScheme, View } from 'react-native';

import '../global.css';
import { initSentry } from '../lib/sentry';
import { setInstalledVersion } from '../lib/api';
import { appStatus, subscribeAppStatus, type AppStatus } from '../lib/app-status';
import { resolveDeepLink } from '../lib/navigation';
import { launchNotification, onNotificationTapped, onTokenChange } from '../lib/push';
import { enablePush } from '../lib/push';
import { resolveTheme, tokensFor, type ResolvedTheme } from '../lib/theme';
import { SessionProvider, useSession } from '../lib/session';
import { ForceUpdateScreen, MaintenanceScreen } from '../components/status-screens';

// Before the first render: an SDK started later misses the crash that
// happened during startup, which is the one worth having.
initSentry();

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.curhatdong.app';

/**
 * Root layout — E16-T02.
 *
 * Holds the session, resolves the theme, and does the one piece of routing that
 * has to happen above every screen: sending a signed-out person to `/auth` and
 * an un-onboarded one to `/onboarding`.
 *
 * The redirect lives here rather than in each screen because a missed check is
 * invisible until somebody lands on a screen that quietly renders empty.
 */

function ThemedApp() {
  const { status } = useSession();
  const router = useRouter();
  const [health, setHealth] = useState<AppStatus>(appStatus());
  const segments = useSegments();
  const systemScheme = useColorScheme();
  // `useColorScheme` can also return undefined; the theme resolver takes a
  // three-state value so "unknown" cannot be mistaken for "light".
  const scheme = systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : null;
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveTheme('system', scheme, new Date()),
  );

  useEffect(() => {
    const update = () => setTheme(resolveTheme('system', scheme, new Date()));
    update();
    // Midnight Mode starts and ends at a wall-clock hour. Without a tick, an
    // app left open at 20:58 stays in the day palette all night.
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [scheme]);

  // The API client raises this from any response (E16-T11).
  useEffect(() => subscribeAppStatus(setHealth), []);

  useEffect(() => {
    setInstalledVersion(Constants.expoConfig?.version ?? '0.0.0');
  }, []);

  /**
   * A notification tap decides where to go — E16-T09.
   *
   * Two paths, because a tap that starts the process arrives before any
   * listener exists: `launchNotification` covers the cold start, the listener
   * covers taps while the app is already running. Both go through
   * `resolveDeepLink`, so a payload from outside cannot steer navigation.
   */
  useEffect(() => {
    if (status !== 'authenticated') return;

    void (async () => {
      const launched = await launchNotification();
      if (launched) router.push(resolveDeepLink(launched.deepLink));
    })();

    const offTap = onNotificationTapped((notification) => {
      router.push(resolveDeepLink(notification.deepLink));
    });
    // Expo can rotate the token after an update or a device restore; without
    // re-registering, the account keeps pushing to a token nobody hears.
    const offToken = onTokenChange(() => void enablePush());

    return () => {
      offTap();
      offToken();
    };
  }, [router, status]);

  useEffect(() => {
    if (status === 'loading') return;

    const first = segments[0];
    const onAuthScreen = first === 'auth';
    const onOnboarding = first === 'onboarding';

    if (status === 'anonymous' && !onAuthScreen) router.replace('/auth');
    // Not while the auth screen is still showing the 18+ gate: that step runs
    // after the account exists but before onboarding may start
    // (DESIGN-REF §2.2c), and redirecting here would skip it entirely.
    else if (status === 'onboarding' && !onOnboarding && !onAuthScreen) {
      router.replace('/onboarding');
    }
    else if (status === 'authenticated' && (onAuthScreen || onOnboarding)) router.replace('/');
  }, [router, segments, status]);

  const tokens = tokensFor(theme);

  const retry = useCallback(() => {
    // Re-entering the app re-issues the requests that raised the state; if the
    // window is over, the next response clears it.
    router.replace('/');
  }, [router]);

  if (health === 'force_update') {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <ForceUpdateScreen onOpenStore={() => void Linking.openURL(PLAY_STORE_URL)} />
      </View>
    );
  }

  if (health === 'maintenance') {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <MaintenanceScreen onRetry={retry} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: tokens.bg },
          headerTintColor: tokens.text,
          contentStyle: { backgroundColor: tokens.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="curhat/baru" options={{ title: 'Cerita baru' }} />
        <Stack.Screen name="post/[id]" options={{ title: 'Curhat' }} />
        <Stack.Screen name="ai/index" options={{ title: 'DONG AI' }} />
        <Stack.Screen name="room/[id]" options={{ title: 'Ruang ngobrol' }} />
        <Stack.Screen name="listener/request" options={{ title: 'Cari listener' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifikasi' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Pengaturan' }} />
        <Stack.Screen name="settings/data" options={{ title: 'Data & privasi' }} />
        <Stack.Screen name="moderation/actions" options={{ title: 'Riwayat moderasi' }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <ThemedApp />
    </SessionProvider>
  );
}
