---
id: E16-T13
epic: E16
title: OTA update (expo-updates)
status: done
estimate: 1d
depends_on: [E16-T12]
refs: [TECH-SPEC §9.4]
---

## Scope
Konfigurasi `expo-updates` / EAS Update + strategi `runtimeVersion`.

## Acceptance criteria
- **OTA hanya untuk perubahan yang kompatibel dengan `runtimeVersion`** (TECH-SPEC §9.4).
- Perubahan native dependency wajib build binary baru — dokumentasikan supaya tidak keliru dikirim lewat OTA.
- Rollback update tersedia.

## Verifikasi
Kirim OTA ke build preview; verifikasi update masuk dan rollback berfungsi.

## Catatan implementasi

- `runtimeVersion: { policy: 'appVersion' }` — update hanya sampai ke build
  dengan versi sama, jadi batas OTA jadi mekanis, bukan hal yang harus diingat.
- Aturan "perubahan native = binary baru" ditulis di `apps/mobile/README.md`
  berikut alasannya: OTA yang mengasumsikan modul native yang tidak ada di
  binary terpasang akan crash saat launch, dan crash-nya terlihat seperti
  aplikasinya rusak, bukan seperti update yang salah.
- **Kirim OTA + rollback belum diuji** — butuh akun EAS.
