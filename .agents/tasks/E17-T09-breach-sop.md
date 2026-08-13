---
id: E17-T09
epic: E17
title: SOP breach notification (3×24 jam)
status: in_progress
estimate: 1d
depends_on: [E14-T03]
refs: [PRD §25.2, TECH-SPEC §18.4]
---

## Scope
Dokumen SOP + PIC on-call + template notifikasi + kemampuan query "siapa yang terdampak" dari audit log.

## Acceptance criteria
- UU PDP mewajibkan pemberitahuan tertulis dalam **3×24 jam** — tiga prasyarat (PIC, template, kemampuan query) harus siap **sebelum** insiden, karena tidak bisa disiapkan dalam 72 jam.
- Audit log & access log bisa di-query untuk menentukan lingkup terdampak.
- SOP mencakup containment, penentuan lingkup, notifikasi, post-mortem.

## Verifikasi
Table-top exercise: simulasikan insiden, ukur apakah lingkup terdampak bisa ditentukan < 24 jam.

## Catatan implementasi

- **Kemampuan "siapa yang terdampak" dibuat sebagai kode, bukan paragraf**:
  `apps/api/src/worker/breach-scope.ts` + 9 test. Alasannya ada di AC-nya
  sendiri — di dalam 72 jam tidak ada yang akan menulis query ke skema yang baru
  dia lihat sambil menahan insidennya.
- Fungsi itu mengembalikan **id user dan kategori data, bukan isinya**. Respons
  insiden yang dimulai dengan menumpahkan curhat terdampak ke file kerja sudah
  memperlebar kebocoran sambil mengukurnya.
- **Aksi audit yang tidak dikenali dilaporkan, bukan dianggap aman.** Aksi baru
  yang belum dipetakan akan terhitung "tidak menyentuh apa pun" dan membuat
  pemberitahuan meremehkan kejadian.
- Jendela audit dihitung dari **dugaan awal kompromi**, bukan dari saat
  ketahuan; selisihnya biasanya justru tempat kerusakannya.
- `percobaan akses yang gagal` (E14-T04) dihitung untuk post-mortem tapi **tidak**
  menambah jumlah terdampak.
- SOP: `docs/SOP-BREACH.md` (containment → lingkup → notifikasi → post-mortem).
  Template: `docs/SOP-BREACH-TEMPLATES.md`.

## Yang masih kosong — butuh manusia

- **PIC on-call + cadangannya (nama, bukan jabatan)**, kontak penasihat hukum,
  dan format/kanal resmi pelaporan yang wajib diverifikasi ke sumber terkini.
- **Table-top exercise belum dijalankan**, jadi klaim "lingkup bisa ditentukan
  < 24 jam" belum terbukti — baru bisa dijalankan.
