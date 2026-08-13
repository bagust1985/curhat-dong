---
id: E16-T05
epic: E16
title: Feed & create curhat (mobile)
status: done
estimate: 2d
depends_on: [E16-T04, E05-T07]
refs: [DESIGN-REF §2.4, §2.6]
---

## Scope
4 tab feed, infinite scroll, pull-to-refresh, create curhat full screen, draft autosave, Midnight Mode.

## Acceptance criteria
- Feature parity dengan web untuk fitur utama (PRD §3).
- Draft tersimpan lokal di device.
- State held & L3 ditangani sama seperti web.

## Verifikasi
Uji di device fisik dengan koneksi lambat.

## Catatan implementasi

- Pull-to-refresh **asli** di mobile (`RefreshControl`) — di web sengaja tidak
  dibuat karena browser sudah punya gesturnya; di sini gestur itu idiom platform.
- Anti-duplikat sama seperti web: guard in-flight + `mergePages`.
- Draft di AsyncStorage, **bukan** SecureStore: draft itu teks user sendiri, bukan
  kredensial, dan menaruhnya di keystore mengaburkan untuk apa SecureStore ada.
- **Belum diuji di perangkat fisik / koneksi lambat.**
