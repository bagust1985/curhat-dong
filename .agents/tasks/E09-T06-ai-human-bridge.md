---
id: E09-T06
epic: E09
title: AI→Human Bridge (CTA Cari Listener)
status: todo
estimate: 1d
depends_on: [E09-T05]
refs: [PRD §10, DESIGN-REF §2.8c]
---

## Scope
Kartu in-chat kontekstual: "Ada beberapa orang yang pernah mengalami situasi mirip dan siap mendengarkan. → Cari Listener", dengan prefill topik/emosi.

## Acceptance criteria
- Muncul saat relevan, bukan di setiap balasan — bridge yang terlalu sering terasa seperti diusir.
- Wajib muncul pada konteks risiko tinggi.
- Mendorong ke manusia nyata sejalan dengan AI Rules (dilarang mendorong isolasi).

## Verifikasi
Test pemicu bridge; manual review agar frekuensinya terasa wajar.
