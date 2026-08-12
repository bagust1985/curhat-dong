---
id: E14-T05
epic: E14
title: Moderation queue 4 level + SLA timer
status: done
estimate: 1.5d
depends_on: [E14-T04, E07-T08]
refs: [PRD §15.3, TECH-SPEC §18.7, DESIGN-REF §3.3]
---

## Scope
Tabs Critical/High/Medium/Low, badge count, SLA timer visual, sumber case, umur, assignee.

## Acceptance criteria
- Critical menyala dan selalu di atas.
- SLA timer merah saat lewat `sla_due_at`.
- Cursor pagination (TECH-SPEC §8.2).
- Daftar queue tidak menampilkan isi konten penuh — buka konten butuh langkah sadar (E14-T04).

## Verifikasi
Test tampilan SLA dengan case yang sudah lewat; test paginasi.
