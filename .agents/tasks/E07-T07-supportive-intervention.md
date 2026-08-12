---
id: E07-T07
epic: E07
title: Supportive intervention L3 + support resources
status: done
estimate: 1.5d
depends_on: [E07-T04, E02-T07]
refs: [PRD §8, §15.1, §15.2, TECH-SPEC §18.5, §18.6, DESIGN-REF §2.7]
---

## Scope
Payload intervention + query `support_resources` per region; kanal SSE `safety.intervention`, WS `room:safety`, atau field HTTP.

## Acceptance criteria
- **Tanpa punish, tanpa suspend, tanpa menampilkan level/skor ke user** (non-negotiable #2).
- Hanya resource `is_active` dengan `verified_at` masih berlaku (≤3 bulan).
- Hasil kosong → fallback jujur (DONG AI / Cari Listener / hubungi orang terdekat). **Jangan hardcode nomor cadangan.**
- CTA sekunder: Ngobrol sama DONG AI / Cari Listener; user selalu bisa menutup dengan tenang.
- Berlaku untuk post, komentar, DONG AI, **dan** pesan private room (PRD §15.1).

## Verifikasi
Test: resource kedaluwarsa tidak muncul; region tanpa resource → fallback, bukan layar kosong; payload tidak memuat skor.
