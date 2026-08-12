---
id: E15-T13
epic: E15
title: Halaman LISTEN — aktivasi, dashboard, match offer, limit state
status: todo
estimate: 2d
depends_on: [E15-T03, E10-T09]
refs: [DESIGN-REF §2.9, §2.20]
---

## Scope
Aktivasi + guidelines (wajib scroll & accept), dashboard (toggle available, statistik, preferensi, riwayat), MatchOfferModal (TTL 60s countdown), RestStateBanner (cooldown / cap harian / reminder istirahat).

## Acceptance criteria
- Guidelines wajib di-scroll sampai habis sebelum tombol accept aktif.
- Match offer menampilkan topik + mood + emosi **tanpa identitas**.
- State istirahat bertone **apresiatif, bukan peringatan**; tidak ada tombol memaksa lanjut.
- Tidak ada leaderboard.

## Verifikasi
Uji countdown offer, seluruh state limit, dan alur accept guidelines.
