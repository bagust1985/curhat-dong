---
id: E16-T13
epic: E16
title: OTA update (expo-updates)
status: todo
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
