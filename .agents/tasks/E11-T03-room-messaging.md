---
id: E11-T03
epic: E11
title: Kirim & terima pesan realtime
status: done
estimate: 1.5d
depends_on: [E11-T02]
refs: [TECH-SPEC §3.5, §8.3, DESIGN-REF §2.11]
---

## Scope
`room:message` client→server dan server→client; persist ke `messages`; `GET /rooms/:id/messages?cursor=`.

## Acceptance criteria
- Delivery < 2 detik (TECH-SPEC §8.3).
- Pesan persisted sebelum di-broadcast — jangan sampai user melihat pesan yang hilang setelah refresh.
- Deduplikasi lewat client message id (mencegah ganda saat reconnect).
- Riwayat memakai cursor pagination.

## Verifikasi
Test roundtrip + reconnect dengan pesan tertunda; ukur latency.
