---
id: E15-T06
epic: E15
title: Halaman auth — login, OTP, age gate
status: todo
estimate: 1.5d
depends_on: [E15-T01, E03-T02]
refs: [DESIGN-REF §2.2]
---

## Scope
Login/signup (email + Google), verifikasi OTP 6 digit dengan resend timer, age gate 18+.

## Acceptance criteria
- Copy reassurance: "Email kamu nggak akan pernah ditampilkan ke siapa pun."
- State error: kode salah, kedaluwarsa, kena rate limit — masing-masing beda pesan, tapi tidak membocorkan apakah email terdaftar.
- Age gate ditolak → layar ramah, bukan menyalahkan.

## Verifikasi
Uji seluruh state error; verifikasi tidak ada kebocoran enumeration di UI.
