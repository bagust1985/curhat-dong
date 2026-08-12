---
id: E04-T02
epic: E04
title: API consent — grant, revoke, versioning
status: todo
estimate: 1.5d
depends_on: [E02-T07]
refs: [PRD §25.3, TECH-SPEC §18.1]
---

## Scope
- `GET /me/consents`, `POST /me/consents`.
- 3 jenis: `tos_privacy` (wajib), `sensitive_processing` (wajib), `analytics` (opsional).

## Acceptance criteria
- Onboarding **ditolak** kalau 2 consent wajib tidak ada.
- `analytics` bisa ditolak/dicabut **tanpa** mengurangi fungsi apa pun — kalau ada fitur yang mati, itu bug.
- Pencabutan mengisi `revoked_at`, histori tidak dihapus.
- Naiknya `document_version` memicu permintaan consent ulang saat login berikutnya.

## Verifikasi
Test: onboarding tanpa consent wajib → error; cabut analytics → seluruh endpoint inti tetap 200.
