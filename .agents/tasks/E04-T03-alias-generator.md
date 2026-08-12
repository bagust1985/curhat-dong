---
id: E04-T03
epic: E04
title: Anonymous alias — generator, cek ketersediaan, avatar preset
status: todo
estimate: 1d
depends_on: [E03-T10]
refs: [PRD §4, DESIGN-REF §2.3]
---

## Scope
- Generator alias gaya "LangitMalam" / "Anonymous Panda 2847" dari kamus Indonesia.
- Cek ketersediaan realtime + set avatar preset.

## Acceptance criteria
- Alias unik case-insensitive.
- Kamus disaring dari kata kasar/sensitif.
- Alias custom divalidasi (panjang, karakter, blacklist).

## Verifikasi
Test tabrakan alias; generate 1000 alias → tidak ada yang melanggar blacklist.
