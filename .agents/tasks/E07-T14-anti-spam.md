---
id: E07-T14
epic: E07
title: Anti-spam & device risk
status: done
estimate: 1d
depends_on: [E07-T13]
refs: [PRD §15, TECH-SPEC §7.3]
---

## Scope
Deteksi mass posting, konten duplikat, mass DM, tautan berbahaya, kata kunci scam, pola bot. Sinyal device risk dasar.

## Acceptance criteria
- Berlapis: rate limit + trust score + device risk + Turnstile bila perlu.
- Duplikat terdeteksi lewat similarity, bukan sekadar sama persis.
- **Jangan menghukum user asli yang kebetulan menulis dua curhat mirip** — condongkan ke tinjau, bukan blokir otomatis.

## Verifikasi
Test korpus spam vs konten asli; ukur false positive dan catat di PR.
