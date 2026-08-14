import type { ExpoConfig } from 'expo/config';

/**
 * Expo app configuration — E16-T01. TECH-SPEC §1.2, §9.4.
 *
 * A `.ts` config rather than `app.json` because two values have to be computed:
 * the runtime version (which decides what an OTA update is allowed to replace —
 * E16-T13) and the public API URL, which differs per build profile.
 *
 * Nothing secret goes in here. Everything in this file ends up inside the APK
 * and can be read by anyone who unzips it (TECH-SPEC §7.2), so the only
 * environment values referenced are `EXPO_PUBLIC_*`.
 */

const VERSION = '0.1.0';

const config: ExpoConfig = {
  name: 'CURHAT DONG',
  slug: 'curhat-dong',
  scheme: 'curhatdong',
  version: VERSION,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // Dark is the primary design target because peak usage is at night
  // (DESIGN-REF §0); the splash follows the dark background rather than
  // flashing white at 2am.
  backgroundColor: '#1a1020',

  android: {
    package: 'com.curhatdong.app',
    versionCode: 1,
    adaptiveIcon: { backgroundColor: '#1a1020' },
    // Only what the product actually uses. Every extra permission is a reason
    // for somebody to distrust an app about their private life.
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#ff86bb',
      },
    ],
  ],

  /**
   * OTA boundary — TECH-SPEC §9.4, E16-T13.
   *
   * `appVersion` policy: an update only reaches a build with the same version
   * string. Adding or upgrading a native module means a new binary, never an
   * OTA push, and tying the runtime version to the app version is what makes
   * that mechanical rather than a thing somebody has to remember.
   */
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    // `ON_ERROR_RECOVERY` rather than on every launch: a failed update should
    // fall back to the last working bundle instead of leaving a broken app.
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
  },

  extra: {
    router: {},
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '' },
  },

  experiments: {
    typedRoutes: true,
  },
};

export default config;
