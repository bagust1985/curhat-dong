# @curhat/mobile

Expo SDK 57 · React Native 0.86 · NativeWind 4 (Tailwind **3.4.x**, only here).

## Build profiles (E16-T12)

| Profile | Output | For |
|---|---|---|
| `development` | APK, dev client | day-to-day work against a local API |
| `preview` | APK | internal testing on real devices |
| `production` | AAB | Play Store |

```bash
pnpm --filter @curhat/mobile start     # dev client
eas build --profile preview --platform android
eas build --profile production --platform android
```

## What must never end up in the binary

Only `EXPO_PUBLIC_*` values reach the app (`lib/api.ts`, `app.config.ts`).
Anyone can unzip an APK and read them, so a server key placed there is a leaked
key (TECH-SPEC §7.2). Signing credentials are managed by EAS and are **not** in
this repo.

Before shipping a build, check what actually got embedded:

```bash
unzip -p build.apk assets/index.android.bundle | grep -iE "secret|service_role|sk_live|password" | head
```

## OTA updates (E16-T13)

`runtimeVersion` follows `appVersion` (`app.config.ts`). An update only reaches
a build whose version string matches, which makes the rule mechanical rather
than something to remember:

- **JS/asset change** → `eas update --channel preview` is fine;
- **new or upgraded native module** (anything with an Android build step —
  `expo-notifications`, `expo-screen-capture`, Reanimated) → bump `version` and
  ship a new binary. An OTA that assumes native code the installed binary does
  not have crashes on launch, and the crash looks like the app is broken rather
  than like a bad update.

Rollback: `eas update:rollback --channel preview`, or republish the previous
update group.
