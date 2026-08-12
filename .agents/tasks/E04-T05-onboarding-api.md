---
id: E04-T05
epic: E04
title: Endpoint onboarding
status: done
estimate: 1d
depends_on: [E04-T01, E04-T02, E04-T03]
refs: [TECH-SPEC §3.1, PRD §5]
---

## Scope
`POST /onboarding` — alasan pakai, topik pilihan, alias, age gate, consent, acknowledge safety rules.

## Acceptance criteria
- Atomik: gagal di tengah tidak meninggalkan user setengah jadi.
- Langkah 2–3 boleh dilewati; consent & safety rules **tidak boleh**.
- Idempoten kalau dipanggil ulang.

## Verifikasi
Integration: alur penuh signup → onboarding → `/me` lengkap. Test rollback saat alias bentrok.
