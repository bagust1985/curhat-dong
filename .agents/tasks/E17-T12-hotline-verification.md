---
id: E17-T12
epic: E17
title: Kumpulkan & verifikasi hotline Indonesia
status: todo
estimate: 1.5d
depends_on: [E14-T13]
refs: [PRD §15.2, TECH-SPEC §18.5]
---

## Scope
Kumpulkan layanan krisis/dukungan Indonesia, verifikasi ke sumber resmi, isi `support_resources` dengan `verified_at` + `source_url`.

## Acceptance criteria
- **Blocker rilis** — tanpa ini layar krisis (E15-T10) kehilangan isinya.
- Setiap entri punya sumber resmi dan tanggal verifikasi.
- **Nomor yang tidak dapat diverifikasi tidak boleh ditayangkan.** Hotline mati lebih berbahaya daripada tidak menampilkan apa pun — orang dalam krisis mencoba, gagal, lalu merasa lebih sendirian.
- Jadwalkan re-verifikasi tiap 3 bulan.

## Verifikasi
Telepon/cek tiap kanal sebelum diaktifkan. Catat hasilnya. Ulangi tiap kuartal.
