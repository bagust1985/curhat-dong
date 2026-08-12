---
id: E17-T07
epic: E17
title: Backup harian + uji restore
status: todo
estimate: 1.5d
depends_on: [E17-T02]
refs: [TECH-SPEC §7.6]
---

## Scope
`pg_dump` harian → terenkripsi → Vultr Object Storage; retensi 30 hari; prosedur restore terdokumentasi.

## Acceptance criteria
- Backup terenkripsi; kunci tidak disimpan bersama backup.
- Retensi 30 hari rolling.
- **Uji restore minimal bulanan** — backup yang tidak pernah dites restore dianggap belum valid (TECH-SPEC §7.6).

## Verifikasi
Lakukan restore penuh ke database kosong dan catat waktunya. Jadwalkan pengulangan bulanan.
