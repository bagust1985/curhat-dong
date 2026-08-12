---
id: E17-T09
epic: E17
title: SOP breach notification (3×24 jam)
status: todo
estimate: 1d
depends_on: [E14-T03]
refs: [PRD §25.2, TECH-SPEC §18.4]
---

## Scope
Dokumen SOP + PIC on-call + template notifikasi + kemampuan query "siapa yang terdampak" dari audit log.

## Acceptance criteria
- UU PDP mewajibkan pemberitahuan tertulis dalam **3×24 jam** — tiga prasyarat (PIC, template, kemampuan query) harus siap **sebelum** insiden, karena tidak bisa disiapkan dalam 72 jam.
- Audit log & access log bisa di-query untuk menentukan lingkup terdampak.
- SOP mencakup containment, penentuan lingkup, notifikasi, post-mortem.

## Verifikasi
Table-top exercise: simulasikan insiden, ukur apakah lingkup terdampak bisa ditentukan < 24 jam.
