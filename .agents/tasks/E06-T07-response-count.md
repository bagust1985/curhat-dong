---
id: E06-T07
epic: E06
title: Pemeliharaan response_count
status: done
estimate: 0.5d
depends_on: [E06-T02]
refs: [TECH-SPEC §4.7, §2.4]
---

## Scope
Jaga `curhat_posts.response_count` akurat (komentar dibuat/dihapus/dimoderasi).

## Acceptance criteria
- Konsisten di bawah operasi bersamaan (increment atomik, bukan read-modify-write).
- Komentar yang di-remove moderator mengurangi hitungan.
- Dipakai tab "Butuh Didengar" — hitungan salah = post yang sudah dijawab muncul lagi di sana.

## Verifikasi
Test konkurensi: 50 komentar paralel → hitungan tepat 50.
