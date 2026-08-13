---
id: E15-T10
epic: E15
title: Layar Supportive Intervention (L3)
status: done
estimate: 1.5d
depends_on: [E15-T04, E07-T07]
refs: [DESIGN-REF §2.7, PRD §8, PRD §15.1]
---

## Scope
Layar paling hati-hati di seluruh produk: pesan empati + support resources + CTA sekunder.

## Acceptance criteria
- Tone hangat, **tanpa menghakimi, tanpa bahasa klinis dingin**.
- **Tidak ada tombol punish/blokir; tidak menampilkan skor/level ke user** (non-negotiable #2).
- Resource tap-to-call/chat; kalau kosong → alternatif jujur, bukan layar kosong.
- User selalu bisa keluar dengan tenang ("Aku mengerti, tutup").
- Kalimat pendek, kontras tinggi, aksi jelas (PRD §23.1) — di sini kejelasan mengalahkan gaya.

## Verifikasi
Review copy bersama-sama sebelum rilis; uji state resource kosong.

## Catatan implementasi

- Aturan copy ditulis sebagai **assertion**, bukan cuma catatan review: daftar
  `FORBIDDEN_TONE` (skor, level, diagnosis, sanksi) diuji terhadap seluruh teks
  yang ter-render, di dua state (ada resource / kosong).
- Panjang kalimat diuji per elemen, maksimal 32 kata — di layar ini kejelasan
  mengalahkan gaya (PRD §23.1).
- State resource kosong menyatakan apa adanya bahwa daftar terverifikasi belum
  ada (E17-T12), bukan heading kosong.
- Tidak ada satu pun tombol yang melakukan sesuatu *terhadap* user.
