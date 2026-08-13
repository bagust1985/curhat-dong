---
id: E15-T07
epic: E15
title: Onboarding 7 langkah + consent
status: done
estimate: 2d
depends_on: [E15-T06, E04-T05]
refs: [DESIGN-REF §2.3, PRD §5, §25.3]
---

## Scope
Welcome → alasan → topik → alias & avatar → **consent** → safety rules → Home.

## Acceptance criteria
- Consent: 3 checkbox, **tidak ada yang pre-checked**, tombol lanjut nonaktif sampai 2 wajib dicentang.
- Analitik jelas opsional: "Boleh nggak diaktifin, semua fitur tetap jalan."
- Safety rules terpisah dari consent.
- Step 2–3 skippable; 5 & 6 tidak.
- Copy welcome: "Di sini kamu nggak harus terlihat baik-baik saja."

## Verifikasi
Uji alur penuh; verifikasi consent tercatat terpisah di backend.

## Catatan implementasi

- Consent dikirim **ketiganya**, termasuk yang ditolak. "Dia bilang tidak" itu
  catatan kepatuhan juga (PRD §25.3); mengirim yang di-grant saja menghilangkan
  bukti bahwa analitik memang ditawarkan dan ditolak.
- Seluruh jawaban ditahan di memori sampai submit terakhir, mengikuti API yang
  menyelesaikan onboarding secara atomik — yang menutup tab di langkah 4 tidak
  meninggalkan akun setengah jadi.
- `ALIAS_TAKEN` saat submit melempar user balik ke langkah alias, bukan pesan
  error buntu.
