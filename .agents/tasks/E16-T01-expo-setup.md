---
id: E16-T01
epic: E16
title: Setup Expo SDK 57 + NativeWind 4 + Tailwind 3.4.x
status: done
estimate: 1.5d
depends_on: [E01-T02]
refs: [TECH-SPEC §1.2, §11.2, CLAUDE.md stack]
---

## Scope
`npx create-expo-app@latest --template default@sdk-57`, NativeWind 4, `tailwind.config.js` + `global.css`, `app.config.ts`, Hermes.

## Acceptance criteria
- **Tailwind 3.4.x hanya di `apps/mobile`** — jangan paksa satu versi Tailwind untuk seluruh workspace (TECH-SPEC §1.2).
- `apps/mobile` punya devDependency Tailwind sendiri.
- Dev build jalan (`--dev-client`), bukan mengandalkan Expo Go untuk pengembangan produksi.

## Verifikasi
`npx expo start --dev-client` jalan di emulator; verifikasi versi Tailwind di web tetap 4.x.

## Catatan implementasi

- Dibuat manual, bukan `create-expo-app`: template default akan menimpa konvensi
  monorepo (tsconfig bersama, eslint root, katalog versi).
- Versi native diselaraskan `expo install --check` → RN 0.86.2, React 19.2.3,
  Reanimated 4.5.1. **React di-pin sendiri di `apps/mobile`**, tidak ikut katalog
  (web pakai 19.2.8 untuk Next 16) — carve-out yang sama alasannya dengan
  Tailwind.
- **TypeScript tetap 5.9.3** (katalog) walau Expo menyarankan 6.0.3. Menaikkan TS
  hanya untuk mobile akan memecah tsconfig bersama; sarannya advisory, bukan syarat.
- `react-native-css-interop` dideklarasikan eksplisit sebagai dependency:
  `node-linker=isolated` bikin JSX hasil kompilasi NativeWind tidak bisa resolve
  paket yang tidak dideklarasikan app. Ditemukan saat `expo export` gagal.
- **Belum diverifikasi di emulator/perangkat** — tidak ada Android SDK di
  lingkungan ini. Yang membuktikan setup benar: `expo export --platform android`
  menghasilkan bundle Hermes 3.9MB.
