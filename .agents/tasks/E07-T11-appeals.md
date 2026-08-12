---
id: E07-T11
epic: E07
title: Banding moderasi — API user
status: done
estimate: 1.5d
depends_on: [E07-T10]
refs: [PRD §15.4, TECH-SPEC BAGIAN 19, DESIGN-REF §2.19]
---

## Scope
`GET /me/moderation-actions`, `POST /appeals`, `GET /appeals/:id`.

## Acceptance criteria
- Window 14 hari, 1 banding per aksi, SLA respons 7 hari.
- Aksi tidak appealable → ditolak dengan alasan jelas.
- Status: `pending → under_review → upheld|overturned|reduced`.
- Hasil disampaikan dengan bahasa manusia, bukan kode status.

## Verifikasi
Test: banding lewat window ditolak; banding kedua atas aksi sama ditolak.
