---
id: E17-T14
epic: E17
title: Security review pra-rilis
status: in_progress
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

## Catatan implementasi

- `infrastructure/scripts/security-review.sh` memutuskan bagian yang bisa
  diputuskan mesin, lalu **mendaftar sisanya sebagai pekerjaan manusia** — supaya
  beda antara "diperiksa" dan "diasumsikan" tetap kelihatan.
- Hasil run: **10 lolos, 0 gagal**.
- **Tiga FAIL pertama ternyata positif palsu dari checker-nya sendiri**, dan
  itu diperbaiki: (a) modul admin ikut ter-scan padahal E14-T04 memang
  mengizinkan moderator membaca trust score lewat case aktif dan itu teraudit;
  (b) `.env.example` dianggap file kredensial padahal isinya nama variabel tanpa
  nilai; (c) komentar yang menjelaskan larangan secret di `NEXT_PUBLIC_*`
  terbaca sebagai pelanggaran aturan itu sendiri. Checklist yang sering salah
  alarm akan berhenti dibaca — itu kegagalan yang sama dengan monitoring.
- **Belum dilakukan** (tercetak oleh skrip): MFA admin aktif di produksi, audit
  akses konten privat di data sungguhan, hotline terverifikasi, scrubbing diuji
  di DSN produksi, dan port DB tertutup diuji dari luar VPS.
