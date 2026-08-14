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
    /*
     * Bumped by hand, on purpose — E18-T08.
     *
     * eas.json used to carry `autoIncrement: "versionCode"` on the production
     * profile, which eas-cli 21 rejects outright: at profile level the field is
     * a boolean, and `eas init` refused to run at all until it was removed.
     *
     * It is not simply corrected because it could not have worked here either
     * way. With `appVersionSource: "local"` EAS increments the number by
     * writing it back into the app config, and this config is a `.ts` file it
     * cannot write to. Play refuses an upload that does not raise this number,
     * so raise it here before each release — or move `appVersionSource` to
     * "remote" in eas.json and let EAS own it instead.
     */
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
    /*
     * The EAS project, `@bagust1986/curhat-dong` — E18-T08.
     *
     * Written here rather than left to an env var. `eas init` normally injects
     * this itself, but it cannot write to a dynamic config, and the previous
     * fallback of `''` meant every EAS command failed with "project not
     * configured" on any machine that had not exported the variable — which
     * was every machine, since it appears in no `.env.example`.
     *
     * Not a secret: the project id ships inside every build and is readable by
     * anyone who unzips the APK. The env override stays for forks and for CI
     * building against a different project.
     */
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '5a1f2b2c-98fb-4039-a5c3-05f3174afc87' },
  },

  experiments: {
    typedRoutes: true,
  },
};

export default config;
