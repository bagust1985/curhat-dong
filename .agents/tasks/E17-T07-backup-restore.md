---
id: E17-T07
epic: E17
title: Backup harian + uji restore
status: in_progress
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

## Catatan implementasi

- `backup.sh`: pg_dump → enkripsi `age` → Vultr Object Storage → prune >30 hari.
  **Kunci tidak pernah ikut backup** — yang ada di server cuma public key;
  private key-nya di password manager tim.
- Dump yang mencurigakan kecil (<10KB) **menggagalkan script**, tidak diupload:
  itu tanda khas dump yang putus di tengah lalu exit 0.
- Plaintext dump di-`shred` dan tidak pernah keluar dari mesin.
- `restore.sh` default me-restore ke database **terpisah**, bukan produksi;
  menimpa produksi butuh mengetik `TIMPA PRODUKSI`. Drill restore tidak boleh
  berjarak satu typo dari menimpa data sungguhan.
- `--no-owner` supaya restore ke database baru tidak butuh role yang sama —
  itu penyebab gagalnya percobaan restore yang paling sering.
- **Belum dilakukan**: restore penuh sungguhan + catat durasinya (angka itu yang
  jadi dasar RTO), dan menjadwalkan drill bulanan.
