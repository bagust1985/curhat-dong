---
id: E17-T06
epic: E17
title: Uptime Kuma + alert ops
status: in_progress
estimate: 1d
depends_on: [E17-T02]
refs: [TECH-SPEC §10.2]
---

## Scope
Monitor API, Web, Admin lewat `/health/live` & `/health/ready`; alert Telegram/ops channel.

## Acceptance criteria
- `ready` mengecek dependency minimum untuk menerima traffic.
- Alert sampai ke kanal yang benar-benar dibaca orang.
- Dozzle terpasang untuk container log MVP.

## Verifikasi
Matikan API → alert masuk dalam ambang waktu yang ditentukan.

## Catatan implementasi

- Lima monitor didokumentasikan di `infrastructure/monitoring/monitors.md`.
  **`ready` yang mengalert, `live` yang mendiagnosis**: ready gagal sementara
  live lolos artinya API hidup tapi tidak bisa mencapai database — malam yang
  sama sekali berbeda dari prosesnya mati.
- Retry count bukan hiasan: 2 retry @60s = alert setelah ~3 menit gagal
  sungguhan. Monitor 1-retry mem-page orang untuk satu paket hilang, dan setelah
  ketiga kalinya alert-nya berhenti dibaca — itu kegagalan monitoring yang
  sebenarnya, bukan outage yang terlewat.
- Isi alert tanpa data user (non-negotiable #3).
- uptime-kuma & dozzle di-bind loopback, diakses lewat SSH tunnel.
- **Belum dilakukan**: membuat monitor di UI, menyambungkan Telegram, dan
  membuktikan alert benar-benar sampai dengan mematikan API. Langkahnya ada di
  dokumen.
