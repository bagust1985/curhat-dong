# Audit Aksesibilitas & Responsif — E15 (Web UI)

**Task:** E15-T17 · **Acuan:** PRD §23.1, DESIGN-REFERENCE §0.1
**Tanggal:** 13 Agustus 2026 · **Cakupan:** seluruh halaman web yang dibangun di E15
(T05–T16)

---

## Ringkasan

| Kriteria | Cara diperiksa | Hasil |
|---|---|---|
| Kontras AA di dark, light, **dan** Midnight | Hitung rasio numerik, 3 tema | ✅ otomatis (`lib/contrast.test.ts`) |
| Ikon mood/reaction/intent terbaca screen reader | Query by accessible name | ✅ otomatis (`components.test.tsx`, `a11y.test.tsx`) |
| Navigasi keyboard penuh + focus visible | axe + uji tab + scan sumber | ✅ otomatis |
| `prefers-reduced-motion` mematikan animasi | Assert isi `globals.css` | ✅ otomatis |
| Font scaling 200% | Assert struktur + **uji manual** | ⚠️ sebagian otomatis — lihat di bawah |
| Responsif desktop/tablet/mobile | **Uji manual** | ⚠️ belum dijalankan di perangkat nyata |

16 layar dijalankan lewat **axe-core** tanpa satu pun violation.

---

## Yang otomatis, dan kenapa begitu

### axe-core atas 16 layar

`components/a11y.test.tsx` merender tiap layar E15 di dalam landmark `<main>` —
sama seperti halaman aslinya — lalu menjalankan axe. Gagal build kalau ada
violation.

Dua hal yang sengaja **tidak** diandalkan ke axe:

1. **Kontras warna dimatikan di axe.** jsdom tidak punya layout maupun computed
   color, jadi setiap rule kontras balik sebagai *incomplete* dan "lolos" yang
   tidak berarti apa-apa. Kontras diverifikasi dengan angka di
   `lib/contrast.test.ts` untuk **ketiga** tema (light, dark, midnight) — itu
   yang menutup kriteria "AA di Midnight Mode juga".
2. **Perilaku screen reader sungguhan.** axe memeriksa nama yang dihitung, bukan
   apa yang diucapkan NVDA/TalkBack. Itu tetap manual (lihat di bawah).

### Keyboard

- Uji tab pada age gate: checkbox → jalan keluar. Tombol utama yang disabled
  memang dilewati, dan itu benar — jalan keluarnya tetap terjangkau.
- Scan sumber: **tidak ada `onClick` pada elemen non-interaktif**. `<div onClick>`
  jalan dengan mouse dan tidak terlihat oleh keyboard; test gagal kalau ada satu
  saja masuk.
- Focus ring: `:focus-visible { outline: 2px solid var(--color-focus) }` di
  `globals.css`, di-assert oleh test.

### Reduced motion

`globals.css` mematikan **animation dan transition** sekaligus. Halaman yang
transisinya mati tapi animasinya jalan masih tetap bergerak, jadi dua-duanya
di-assert.

### Font scaling 200% (sebagian otomatis)

Yang bisa ditegakkan otomatis adalah **propertinya**, bukan hasil visualnya:

- tidak ada tinggi piksel tetap (`h-10` dsb.) pada kotak yang memuat teks —
  `min-h-*` boleh, karena dia tumbuh;
- tidak ada `whitespace-nowrap` di teks isi.

**Temuan & perbaikan:** FAB "+ Curhat" di `components/bottom-nav.tsx` memakai
`h-14 w-14` tetap dengan `text-2xl`. Pada penskalaan teks 200% lingkaran itu
memotong glyph-nya sendiri. Diganti `min-h-14 min-w-14 aspect-square` + padding:
bentuk bulatnya sama pada ukuran normal, dan tumbuh kalau teksnya diperbesar.

---

## Yang masih manual — belum dijalankan

Tiga hal ini **tidak bisa** diklaim lolos dari test:

1. **Screen reader sungguhan** (NVDA di Windows, TalkBack di Android, VoiceOver
   di iOS). Yang sudah dipastikan: setiap ikon mood (11), reaction (6), dan
   intent (4) punya nama yang diucapkan dan bukan cuma glyph. Yang belum:
   urutan baca, pengumuman live region saat balasan streaming masuk, dan
   perilaku fokus saat sheet/dialog terbuka.
2. **Penskalaan teks 200% di browser sungguhan**, per halaman, di lebar mobile.
3. **Responsif di perangkat nyata** — desktop, tablet, mobile browser. Layout
   memakai flex/grid dan unit relatif, tapi itu bukan bukti.

Prosedur uji manual ada di bawah supaya siapa pun bisa menjalankannya sama persis.

### Prosedur uji manual

```
1. Chrome → Settings → Appearance → Font size: Very large (≈200%)
   Buka: / · /auth · /onboarding · /home · /curhat/baru · /post/:id ·
         /ai · /listen · /room/:id · /explore · /search · /notifications ·
         /profile/:alias · /settings · /settings/data · /moderation/actions
   Cari: teks terpotong, tombol bertumpuk, isi keluar dari kartu.

2. Keyboard saja (tanpa mouse): Tab, Shift+Tab, Enter, Esc di tiap halaman.
   Cari: focus ring yang hilang, jebakan fokus di sheet, urutan yang melompat.

3. Screen reader: NVDA (Windows) atau TalkBack (Android).
   Fokus ke: DONG AI saat balasan streaming, sheet Report/Block,
   Supportive Intervention.

4. Lebar layar: 360px, 768px, 1280px.
```

---

## Catatan jujur

Test di repo ini **tidak** membuktikan aplikasinya aksesibel. Yang dibuktikannya:
tidak ada violation yang bisa dideteksi mesin, ikon punya nama, kontras lolos
angka di tiga tema, dan struktur halaman tidak melanggar hal-hal yang bikin
penskalaan teks pecah. Sisanya butuh orang yang benar-benar memakainya dengan
screen reader — dan itu belum dilakukan.
