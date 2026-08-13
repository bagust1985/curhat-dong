---
id: E16-T08
epic: E16
title: Listener flow (mobile)
status: done
estimate: 1.5d
depends_on: [E16-T07, E10-T09]
refs: [DESIGN-REF §2.9, §2.10, §2.20]
---

## Scope
Aktivasi + guidelines, dashboard, match offer (push-driven, TTL 60s), request listener, state istirahat.

## Acceptance criteria
- Match offer bisa muncul dari push saat app di background.
- Countdown TTL akurat walau app baru dibuka dari notifikasi.
- State cap/cooldown bertone apresiatif.

## Verifikasi
Uji offer masuk saat app tertutup → buka dari notifikasi → countdown benar.

## Catatan implementasi

- Countdown TTL dihitung dari `expiresAt`, bukan hitung mundur dari 60 — layar
  yang dibuka dari notifikasi 20 detik kemudian tidak boleh menampilkan 60 lagi.
- Gate panduan wajib scroll sampai bawah (toleransi 8px).
- State istirahat tanpa tombol apa pun.
- **Offer via push saat app di background belum tersambung** — itu bergantung
  E16-T09 yang belum selesai. Sementara ini offer di-poll 10 detik sekali.
