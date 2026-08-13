---
id: E15-T08
epic: E15
title: Home feed + 4 tab
status: done
estimate: 2d
depends_on: [E15-T02, E05-T07]
refs: [DESIGN-REF §2.4]
---

## Scope
Tabs Untuk Kamu / Terbaru / Butuh Didengar / Topik, infinite scroll, pull-to-refresh, kartu Private AI Entry, banner listener nudge, FAB, Midnight Mode copy swap.

## Acceptance criteria
- Loading skeleton, empty state per tab, state offline/error.
- Midnight Mode (21.00–04.00): "Belum tidur? Kalau ada yang mau diceritain, gue di sini."
- Infinite scroll tidak memuat ulang data yang sama saat scroll cepat.
- Tidak ada follower count / leaderboard di mana pun.

## Verifikasi
Uji semua state per tab; ubah jam sistem untuk memverifikasi Midnight Mode.

## Catatan implementasi

- **Pull-to-refresh tidak diimplementasi sebagai gestur khusus di web.** Browser
  mobile sudah punya gestur pull-to-refresh sendiri; menimpanya bikin dua
  perilaku bertabrakan di layar yang sama. Yang disediakan tombol "Muat ulang"
  yang juga terjangkau keyboard. Gestur asli tetap milik E16 (mobile).
- Anti-duplikat scroll cepat dijaga dua lapis: `inFlight` ref (bukan state,
  karena harus benar *sekarang*) dan `mergePages` yang membuang id yang sudah
  ada. Diuji dengan dua klik beruntun sebelum respons pertama mendarat.
- Tiap tab punya list dan cursor sendiri — pindah tab lalu balik tidak memuat
  ulang.
- Infinite scroll pakai IntersectionObserver, dengan tombol "Muat lebih banyak"
  sebagai fallback sekaligus jalur keyboard.
