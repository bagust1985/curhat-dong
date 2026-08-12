---
id: E05-T06
epic: E05
title: Feed tab "Butuh Didengar"
status: todo
estimate: 1d
depends_on: [E05-T05]
refs: [TECH-SPEC §4.7, PRD §6]
---

## Scope
`response_count < 2` DAN umur `< 48 jam`, latest-first, dengan hook ranking untuk nanti.

## Acceptance criteria
- Aturan persis TECH-SPEC §4.7.
- Ini tab paling penting untuk cold start (PRD §23) — pastikan tidak kosong saat data sedikit dengan menurunkan ambang secara terkontrol, bukan menampilkan post lama.
- Post L1+ tidak diberi boost (anti-virality, TECH-SPEC §4.7).

## Verifikasi
Test batas: post dengan 2 respons dan post berumur 49 jam → tidak muncul.
