---
id: E10-T01
epic: E10
title: Aktivasi listener + accept guidelines
status: todo
estimate: 1d
depends_on: [E03-T10]
refs: [PRD §11.1, DESIGN-REF §2.9a]
---

## Scope
Alur "Aku Siap Mendengarkan" → guidelines wajib scroll + accept → simpan `guidelines_version_accepted` + timestamp.

## Acceptance criteria
- **Tidak bisa jadi listener tanpa menerima guidelines** — dijaga di API, bukan hanya UI.
- Isi guidelines memuat 6 poin PRD §11.1, terutama "listener bukan konselor" dan "boleh berhenti".
- Guidelines versi baru → minta accept ulang.

## Verifikasi
Test: aktivasi tanpa accept → ditolak; naikkan versi → status listener minta accept ulang.
