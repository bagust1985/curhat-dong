---
id: E15-T13
epic: E15
title: Halaman LISTEN — aktivasi, dashboard, match offer, limit state
status: done
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

## Catatan implementasi

- Gate panduan pakai toleransi 8px dan **menganggap terbaca kalau memang nggak
  ada yang perlu di-scroll** (layar tinggi). Mengunci pembaca yang sudah melihat
  semuanya adalah bug yang tidak bisa dia akali.
- Versi panduan yang dikirim saat accept adalah versi yang **ditampilkan**, bukan
  konstanta klien — kalau tidak, "dia menyetujui panduan terkini" jadi tidak benar
  setelah teksnya diedit.
- Offer di-*poll* 10 detik sekali, bukan mengandalkan socket saja: listener dengan
  socket basi tidak boleh diam-diam berhenti menerima tawaran. Socket jadi
  optimasi di atasnya (E16).
- Rest state tidak punya tombol apa pun — cap yang bisa ditembus itu hiasan.
- Riwayat sesi hanya waktu dan durasi; isi percakapan tidak pernah keluar dari room.
