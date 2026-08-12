---
id: E03-T01
epic: E03
title: Email provider adapter (Resend)
status: todo
estimate: 0.5d
depends_on: [E02-T02]
refs: [TECH-SPEC §5.2]
---

## Scope
- Interface `EmailProvider` (`sendOtp`, `sendTransactional`) + implementasi Resend.
- Template OTP Bahasa Indonesia, tone hangat.

## Acceptance criteria
- Domain auth bergantung pada interface, bukan Resend — pindah ke Postmark/SES tanpa menyentuh auth.
- Email OTP tidak memuat informasi selain kode + masa berlaku.
- Kegagalan kirim dicatat tanpa membocorkan alamat email ke log.

## Verifikasi
Unit test dengan adapter palsu; kirim manual sekali ke inbox nyata.
