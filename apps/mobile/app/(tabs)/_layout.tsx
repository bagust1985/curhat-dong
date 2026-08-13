import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TABS } from '../../lib/navigation';
import { THEMES } from '../../lib/tokens';

/**
 * Bottom navigation and the floating "+ CURHAT" — E16-T02. DESIGN-REF §1.
 *
 * The FAB sits above the bar rather than in it, because posting is the single
 * most important action in the product (PRD §23) and the five slots leave no
 * room for it. It is a real button with an accessible label, not a decorated
 * view — a floating circle with an `onPress` and no role is invisible to
 * TalkBack.
 *
 * Note the deliberate difference from the web bar, explained in
 * `lib/navigation.ts`: mobile follows DESIGN-REF §1, web follows the brand mock.
 */
export default function TabsLayout() {
  const router = useRouter();
  const tokens = THEMES.dark;

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tokens.text,
          tabBarInactiveTintColor: tokens.muted,
          tabBarStyle: {
            backgroundColor: tokens.surface,
            borderTopColor: tokens.border,
            // Room for the FAB to overlap without covering a label.
            height: 64,
            paddingBottom: 8,
          },
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.key}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarAccessibilityLabel: tab.label,
              tabBarIcon: ({ color }) => (
                <Text accessibilityElementsHidden style={{ color, fontSize: 20 }}>
                  {tab.glyph}
                </Text>
              ),
            }}
          />
        ))}
      </Tabs>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tulis curhat baru"
        onPress={() => router.push('/curhat/baru')}
        className="absolute bottom-12 left-1/2 -ml-8 h-16 w-16 items-center justify-center rounded-full bg-primary"
      >
        <Text className="text-3xl font-bold text-primary-fg" accessibilityElementsHidden>
          +
        </Text>
      </Pressable>
    </View>
  );
}
