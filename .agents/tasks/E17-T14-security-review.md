---
id: E17-T14
epic: E17
title: Security review pra-rilis
status: todo
estimate: 1.5d
depends_on: [E17-T05, E14-T04]
refs: [TECH-SPEC BAGIAN 7, PRD §20, CLAUDE.md non-negotiable]
---

## Scope
Review menyeluruh sebelum go-live terhadap 8 aturan non-negotiable dan BAGIAN 7 Tech Spec.

## Acceptance criteria
Verifikasi satu per satu, dengan bukti:
1. Safety fallback: outage AI tidak membuka bypass (test E07-T05 hijau).
2. L3 tidak pernah menghukum user otomatis.
3. Push & Sentry tidak pernah memuat isi curhat/chat/AI.
4. API publik tidak mengekspos email, provider id, phone, trust/risk score.
5. Semua halaman curhat `noindex`; Redis bukan source of truth.
6. Tidak ada `"latest"` di dependency produksi.
7. Migration destructive butuh review manual.
8. Copy UI Indonesia, tone hangat non-klinis.

Plus: secret tidak ter-commit/ter-bake, admin MFA aktif, akses konten privat teraudit.

## Verifikasi
Checklist ditandatangani; temuan blocker wajib diperbaiki sebelum rilis. Jalankan `/security-review` pada diff akhir.
