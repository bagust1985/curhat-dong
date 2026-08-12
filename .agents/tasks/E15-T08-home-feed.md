---
id: E15-T08
epic: E15
title: Home feed + 4 tab
status: todo
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
