---
id: E10-T10
epic: E10
title: Statistik listener
status: todo
estimate: 0.5d
depends_on: [E10-T09]
refs: [PRD §11, DESIGN-REF §2.9b]
---

## Scope
Jumlah sesi, helpful score, felt heard score, safety status, riwayat sesi.

## Acceptance criteria
- **Tanpa leaderboard popularitas** (PRD §11) — statistik hanya untuk diri sendiri.
- Skor ditampilkan sebagai umpan balik, bukan kompetisi.
- Riwayat sesi tidak menampilkan isi percakapan.

## Verifikasi
Test kontrak: response stats tidak memuat isi pesan atau identitas lawan bicara.
