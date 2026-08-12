---
id: E07-T05
epic: E07
title: Fallback saat AI timeout (split low-risk vs high-risk)
status: todo
estimate: 1.5d
depends_on: [E07-T04]
refs: [TECH-SPEC §4.2, BAGIAN 16, CLAUDE.md non-negotiable #1]
---

## Scope
Implementasi aturan fallback TECH-SPEC §4.2:

```
AI timeout + local rules normal/low  → published, L1, needs_reanalysis=true
AI timeout + local high-risk signal  → held, safety_level=pending, case high/critical
```

## Acceptance criteria
- **Tidak ada satu global fail-open rule.**
- Jalur high-risk: retry AI dengan exponential backoff **dan** buat moderation case — dua-duanya, bukan salah satu.
- Post `needs_reanalysis` dijadwalkan ulang dan hasilnya menimpa level sementara.
- **Outage AI provider tidak boleh menjadi jalur bypass safety** (non-negotiable #1).

## Verifikasi
Unit test dua cabang dengan AI provider yang disimulasikan timeout. Test ini melindungi aturan non-negotiable #1 — jangan pernah di-skip.
