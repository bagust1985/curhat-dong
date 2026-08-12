---
id: E07
title: Safety Engine & Moderation Core
status: todo
tasks: 14
depends_on: [E05, E08]
---

# E07 — Safety Engine & Moderation Core

Epic paling kritis di produk ini. Local rule engine, mapping L0–L3, fallback saat AI timeout, supportive intervention, appeal, trust score.

**Definition of done:** setiap konten melewati pipeline safety; L3 memicu supportive intervention + case Critical **tanpa** menghukum user; outage AI tidak pernah menjadi jalur bypass safety.

**Aturan non-negotiable yang dijaga epic ini:** #1 (safety fallback), #2 (L3 no auto-punish).

**Refs:** PRD §8, §15, §15.1–15.5; TECH-SPEC §4.1, §4.2, §4.3.1, BAGIAN 16, 18, 19
