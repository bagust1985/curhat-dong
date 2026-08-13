import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';

import '../global.css';
import { resolveTheme, tokensFor, type ResolvedTheme } from '../lib/theme';
import { SessionProvider, useSession } from '../lib/session';

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
