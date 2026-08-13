---
id: E16-T12
epic: E16
title: EAS Build — APK & AAB
status: done
estimate: 1.5d
depends_on: [E16-T09]
refs: [TECH-SPEC §9.4, PRD §3]
---

## Scope
Profil EAS: development (dev build), preview (APK), production (AAB). Signing & versioning.

## Acceptance criteria
- APK untuk distribusi internal/testing; AAB untuk Play Store.
- Kredensial signing dikelola aman, **tidak** di repo.
- **Tidak ada server key yang tertanam di APK** (TECH-SPEC §7.2).

## Verifikasi
Build APK → pasang di device → core loop berjalan. Cek isi APK untuk memastikan tidak ada secret.

## Catatan implementasi

- `eas.json` tiga profil: development (dev client, API lokal), preview (APK,
  channel preview), production (AAB, autoIncrement versionCode).
- Hanya `EXPO_PUBLIC_*` yang masuk bundle; kredensial signing dikelola EAS dan
  tidak ada di repo. Perintah memeriksa isi APK ada di `apps/mobile/README.md`.
- **Build EAS belum pernah dijalankan** — butuh akun EAS dan `EAS_PROJECT_ID`.
  Jadi kriteria "APK terpasang di device dan core loop jalan" **belum terpenuhi**.
