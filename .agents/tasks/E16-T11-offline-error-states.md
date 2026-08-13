---
id: E16-T11
epic: E16
title: Offline, error & force update
status: done
estimate: 1d
depends_on: [E16-T05]
refs: [DESIGN-REF §2.17]
---

## Scope
Banner offline, pola toast/error, layar force update & maintenance.

## Acceptance criteria
- Offline tidak menghasilkan layar putih atau crash.
- Force update memblokir penggunaan hanya bila versi benar-benar tidak kompatibel.
- Pesan error berbahasa Indonesia, bukan pesan teknis mentah.

## Verifikasi
Uji mode pesawat di setiap layar utama.

## Catatan implementasi

- **API belum punya endpoint versi/maintenance.** Alih-alih mengarang di klien,
  dua sinyal dibaca dari respons apa pun: header `x-min-app-version` dan status
  `503`. Selama header itu belum dikirim, `evaluate` selalu mengembalikan `ok` —
  arah yang aman: klien yang memblokir secara default akan mem-brick dirinya
  sendiri pertama kali sebuah proxy membuang header.
- Force update memakai `installed < minimum`, **bukan** `installed !== latest`.
  Tertinggal dari versi terbaru itu normal dan tidak boleh memblokir siapa pun.
  Versi yang tidak bisa di-parse juga tidak memblokir.
- `503` = maintenance; `500` **tidak** — bug bukan alasan menutup seluruh app.
  Kalau keduanya berlaku, force update menang: klien lawas tidak bisa dipercaya
  menafsirkan apa pun.
- Pesan error selalu Indonesia; `friendlyError` menahan pesan teknis mentah
  ("Network request failed") supaya tidak pernah sampai ke layar.
- Offline pakai satu komponen bersama; feed tidak lagi punya salinannya sendiri.
- **Uji mode pesawat di tiap layar belum dijalankan** (butuh perangkat).
