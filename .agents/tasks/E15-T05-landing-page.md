---
id: E15-T05
epic: E15
title: Landing page /
status: done
estimate: 1d
depends_on: [E15-T01]
refs: [DESIGN-REF §2.1]
---

## Scope
Hero + tagline, value props, CTA "Mulai Cerita" + "Download APK Android", preview feed dummy, footer legal.

## Acceptance criteria
- Preview feed memakai konten **dummy/curated**, **bukan** curhat asli.
- Satu-satunya halaman yang boleh terindeks (bersama halaman legal).
- Varian midnight.

## Verifikasi
Cek tidak ada request ke API feed asli dari landing page.

## Catatan implementasi

- **Halaman legal masih placeholder.** Naskahnya E17-T10 (butuh review hukum).
  Rutenya dibuat sekarang supaya footer tidak menunjuk 404, dan sengaja
  **tetap noindex** sampai isinya nyata — halaman legal boleh terindeks setelah
  ada dokumennya, bukan sebelum.
- **Tanpa nomor hotline.** Daftar terverifikasi belum ada (E17-T12). Ada test
  yang gagal kalau ada nomor telepon nyelip di landing page.
- **Tombol APK muncul hanya kalau `NEXT_PUBLIC_ANDROID_APK_URL` diisi.** Belum
  ada build, jadi yang tampil kalimat jujur, bukan tombol mati.
- Halaman token E01-T06 pindah ke `/dev/tokens` (tetap noindex).
