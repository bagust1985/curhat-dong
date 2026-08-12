---
id: E14-T15
epic: E14
title: Notification CMS (broadcast) + rate control
status: done
estimate: 1d
depends_on: [E14-T02, E12-T06]
refs: [PRD §18, DESIGN-REF §3.9]
---

## Scope
Compose broadcast (announcement/maintenance/campaign/safety), target segment, schedule, rate control, riwayat kiriman.

## Acceptance criteria
- **Konfirmasi jumlah penerima sebelum kirim** — broadcast salah sasaran tidak bisa ditarik kembali.
- Rate control mencegah membanjiri push provider.
- Broadcast tunduk pada quiet hours kecuali bertipe safety.
- Konten broadcast tidak pernah memuat data user.

## Verifikasi
Test: broadcast ke segmen besar → dialog konfirmasi jumlah + pengiriman ter-throttle.
