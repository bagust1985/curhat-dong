---
id: E11-T08
epic: E11
title: Session feedback dua arah
status: done
estimate: 1d
depends_on: [E11-T07, E06-T06]
refs: [PRD §11, DESIGN-REF §2.11b]
---

## Scope
`POST /rooms/:id/feedback` — requester: "Kamu merasa didengar?" (Iya/Sedikit/Belum); listener: "Percakapan berjalan aman?" (Ya/Tidak + alasan).

## Acceptance criteria
- Feedback requester masuk Felt Heard (E06-T06) dengan aturan anti-fatigue yang sama.
- Jawaban listener "Tidak aman" → memicu review moderasi.
- Thank-you state: "Makasih udah mau dengerin 🤍".
- Feedback opsional — jangan mengunci user di layar ini.

## Verifikasi
Test kedua peran; test bahwa "tidak aman" membuat case.
