---
id: E16-T01
epic: E16
title: Setup Expo SDK 57 + NativeWind 4 + Tailwind 3.4.x
status: todo
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
