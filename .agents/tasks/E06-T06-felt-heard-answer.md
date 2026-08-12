---
id: E06-T06
epic: E06
title: Jawaban Felt Heard + perhitungan rate
status: done
estimate: 1d
depends_on: [E06-T05]
refs: [PRD §9, §19.1, TECH-SPEC §4.6]
---

## Scope
`POST /posts/:id/felt-heard` (yes/somewhat/no) + agregasi Felt Heard Rate.

## Acceptance criteria
- Rate = `(yes + somewhat) / total prompt terjawab`.
- **Prompt yang di-dismiss tidak masuk penyebut** (PRD §9) — kalau masuk, metriknya bohong.
- Satu jawaban per prompt, bisa diubah dalam jendela singkat.
- Rumus terdokumentasi; perubahan rumus wajib masuk changelog PRD.

## Verifikasi
Unit test rumus termasuk kasus dismissed dan pembagian nol.
