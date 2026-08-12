---
id: E02-T07
epic: E02
title: Model compliance — consent, support resources, export, retention
status: done
estimate: 1d
depends_on: [E02-T02]
refs: [TECH-SPEC BAGIAN 18, PRD §25.2, §25.3, §25.4, §15.2]
---

## Scope
`consent_records`, `support_resources`, `data_export_requests`, `retention_runs`, `notification_settings`, `feature_flags`, `app_configs`.

## Acceptance criteria
- `consent_records` satu baris per (user, type, document_version); pencabutan mengisi `revoked_at`, **tidak menghapus baris**.
- `consent_type` enum: `tos_privacy|sensitive_processing|analytics`.
- `support_resources` punya `verified_at` + `source_url` **wajib** — entri tanpa keduanya tidak boleh aktif.
- `retention_runs` mencatat hasil tiap job (bukti kepatuhan).

## Verifikasi
Test: `support_resources` tanpa `source_url` ditolak; revoke consent menambah `revoked_at` tanpa menghapus histori.
