---
id: E10-T08
epic: E10
title: State gagal matching & alternatif
status: todo
estimate: 0.5d
depends_on: [E10-T07]
refs: [TECH-SPEC §4.5, DESIGN-REF §2.10]
---

## Scope
Setelah 5 kandidat gagal: tawarkan DONG AI, posting ke "Butuh Didengar", atau coba lagi.

## Acceptance criteria
- **Jangan menjanjikan listener tersedia** (TECH-SPEC §4.5) — jujur bahwa sedang tidak ada yang siap.
- Copy empatik, bukan pesan error.
- Searching state punya estimasi yang realistis.

## Verifikasi
Integration: tanpa listener available → alur gagal menampilkan 3 alternatif.
