---
id: E15-T11
epic: E15
title: Halaman detail curhat
status: done
estimate: 1.5d
depends_on: [E15-T03, E05-T03]
refs: [DESIGN-REF §2.5]
---

## Scope
Post lengkap + reaction bar, komentar & reply, mark helpful (author), composer dengan cek doxxing, aksi author, report/block, Felt Heard prompt.

## Acceptance criteria
- State: post ditahan (L2), post dihapus, komentar dikunci.
- Badge "Jawaban ini membantu gue" hanya bisa diberi author.
- Felt Heard prompt muncul sesuai aturan anti-fatigue, tidak menghalangi konten.

## Verifikasi
Uji seluruh state; verifikasi prompt tidak muncul dua kali untuk post sama.

## Catatan implementasi

- Post ditahan/dihapus/tidak ada → **satu layar yang sama** buat pembaca lain.
  Membedakannya bakal membocorkan bahwa seseorang menulis sesuatu yang kena
  tinjau. Penulisnya sendiri tetap dapat penjelasan penuh.
- Prompt Felt Heard diambil dari `/me/felt-heard/pending` (aturan anti-fatigue
  ada di server, E06-T06). Klien cuma memutuskan **tidak menutupi konten** —
  posisinya di bawah artikel, diuji lewat `compareDocumentPosition`.
- Dismiss dikirim ke endpoint dismiss, bukan `answer`. Kalau dismiss dihitung
  "belum", North Star jadi ukuran seberapa mengganggu prompt-nya.
- Composer balasan ikut kena peringatan doxxing yang sama.
