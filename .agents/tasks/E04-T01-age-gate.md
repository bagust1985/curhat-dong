---
id: E04-T01
epic: E04
title: Age gate 18+ dengan cooldown penolakan
status: todo
estimate: 1d
depends_on: [E03-T02]
refs: [PRD §25.5, DESIGN-REF §2.2c]
---

## Scope
- Konfirmasi usia wajib, simpan `age_declared_at`.
- Ditolak (<18) → layar ramah + saran alternatif bantuan, bukan pesan menyalahkan.
- Cooldown pada device/browser supaya tidak langsung dicoba ulang dengan tanggal berbeda.

## Acceptance criteria
- MVP memakai **self-declaration**, bukan verifikasi identitas — meminta KTP ke platform anonim menghancurkan premis produknya.
- Deklarasi + timestamp tersimpan.
- Copy publik menyebut "ditujukan untuk 18+", **bukan** "terverifikasi 18+".

## Verifikasi
Test: deklarasi <18 → ditolak + cooldown aktif; percobaan ulang segera ditolak.
