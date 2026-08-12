---
id: E10-T02
epic: E10
title: Preferensi listener (topik, bahasa, max concurrent)
status: todo
estimate: 1d
depends_on: [E10-T01]
refs: [TECH-SPEC §3.4, PRD §11, §11.2]
---

## Scope
`GET/PUT /listener/profile` — topik yang dikuasai, bahasa, max concurrent session.

## Acceptance criteria
- `max_concurrent` default 3; user boleh **menurunkan**, tidak boleh menaikkan (PRD §11.2).
- Bahasa MVP: Indonesia saja (single value), field disiapkan untuk ekspansi.
- Profil listener publik tidak memuat identitas asli atau skor internal.

## Verifikasi
Test: set `max_concurrent=5` → ditolak; set 2 → diterima.
