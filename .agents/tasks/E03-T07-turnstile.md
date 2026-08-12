---
id: E03-T07
epic: E03
title: Cloudflare Turnstile — verifikasi server-side
status: done
estimate: 1d
depends_on: [E03-T02]
refs: [TECH-SPEC §7.3, TECH-SPEC §3.1]
---

## Scope
- Verifikasi token Turnstile di backend; dipicu saat anomaly/threshold risiko terlampaui.
- Sinyal: rate tinggi per IP, banyak email hash baru, device risk.

## Acceptance criteria
- Verifikasi **selalu** di server; token dari client tidak pernah dipercaya apa adanya.
- Turnstile tidak muncul di alur normal — hanya saat anomaly.
- Secret key tidak pernah sampai ke client.

## Verifikasi
Test: request tanpa/dengan token palsu saat threshold aktif → ditolak.
