---
id: E12-T05
epic: E12
title: Penegakan quiet hours
status: done
estimate: 1d
depends_on: [E12-T04, E04-T06]
refs: [PRD §14, TECH-SPEC §4.7]
---

## Scope
Tahan notifikasi non-safety selama 22.00–07.00 waktu lokal; kirim setelah jendela berakhir atau drop bila sudah basi.

## Acceptance criteria
- **Pengecualian**: notifikasi safety/akun tetap dikirim.
- **Bukan pengecualian**: listener nudge & notifikasi sosial.
- Timezone diambil dari device; penanganan lintas tengah malam benar.
- Notifikasi yang sudah tidak relevan di-drop, bukan menumpuk jadi banjir pagi hari.

## Verifikasi
Unit test keputusan kirim/tahan/drop untuk kombinasi jam × tipe × timezone.
