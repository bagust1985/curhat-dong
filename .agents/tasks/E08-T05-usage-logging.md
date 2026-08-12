---
id: E08-T05
epic: E08
title: Logging ai_usage_events
status: done
estimate: 1d
depends_on: [E08-T02]
refs: [TECH-SPEC §10.3, PRD §10]
---

## Scope
Catat provider, model, operation, tokens in/out, `cost_estimate`, `latency_ms`, status, `fallback_used`, `prompt_version`.

## Acceptance criteria
- **Isi percakapan tidak pernah masuk log analitik generik** (TECH-SPEC §10.3, non-negotiable #3).
- Cost estimate memakai tabel harga per model yang bisa diperbarui.
- Logging tidak boleh menggagalkan request utama kalau gagal.

## Verifikasi
Test: panggilan AI menghasilkan tepat satu usage event tanpa isi pesan.
