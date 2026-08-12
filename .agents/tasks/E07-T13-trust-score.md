---
id: E07-T13
epic: E07
title: Trust score (internal) + job recompute
status: todo
estimate: 1d
depends_on: [E07-T10]
refs: [PRD §15, TECH-SPEC §2.2, CLAUDE.md non-negotiable #4]
---

## Scope
Job `recompute-trust-score`: umur akun, perilaku, laporan, interaksi membantu, spam, blokir, riwayat moderasi.

## Acceptance criteria
- **Internal-only** — tidak pernah muncul di API publik atau payload token (non-negotiable #4).
- Dipakai untuk rate limit adaptif & pemicu Turnstile, bukan untuk ranking sosial.
- Faktor tersimpan agar keputusan bisa dijelaskan saat audit.

## Verifikasi
Test kontrak: tidak ada response publik yang memuat trust score. Unit test perhitungan.
