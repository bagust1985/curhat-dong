---
id: E16-T03
epic: E16
title: Auth mobile + Expo SecureStore
status: todo
estimate: 1.5d
depends_on: [E16-T02, E03-T05]
refs: [TECH-SPEC §5.1, §5.3]
---

## Scope
Simpan token di SecureStore, auto-refresh, Google OAuth alur native-compatible.

## Acceptance criteria
- **Refresh token di SecureStore**, tidak pernah di AsyncStorage biasa.
- Auto-refresh transparan; reuse detection memaksa login ulang dengan pesan jelas.
- ID token Google tetap diverifikasi di backend.

## Verifikasi
Uji: tutup app → buka lagi → tetap login; cabut sesi dari device lain → app minta login.
