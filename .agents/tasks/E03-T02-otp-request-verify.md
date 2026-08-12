---
id: E03-T02
epic: E03
title: Endpoint OTP request & verify
status: todo
estimate: 1.5d
depends_on: [E03-T01]
refs: [TECH-SPEC §3.1]
---

## Scope
- `POST /auth/otp/request`, `POST /auth/otp/verify` → pasangan token.
- TTL 10 menit, simpan **hash** kode, batasi percobaan verify.

## Acceptance criteria
- Rate limit 5 request/jam/email-hash.
- **Response generik** — tidak boleh membocorkan apakah email sudah terdaftar (anti-enumeration).
- Kode kedaluwarsa/salah memberi error dengan `code` stabil, bukan pesan berbeda-beda yang bisa dipakai menebak.
- OTP terpakai langsung `consumed_at`, tidak bisa dipakai dua kali.

## Verifikasi
Unit: expiry, consumed, batas percobaan. Integration: 6 request berturut → yang ke-6 kena limit.
