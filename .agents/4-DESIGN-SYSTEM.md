# CURHAT DONG — Design System & Feature Reference (as-built)

> **Status: menggambarkan kode pada 15 Agustus 2026** (`main` @ `84fedc3`, setelah
> E18 rebrand rose dan APK build #7).
>
> Dokumen ini menjelaskan aplikasi **sebagaimana adanya**, bukan sebagaimana
> direncanakan. Pasangannya, [`3-DESIGN-REFERENCE.md`](3-DESIGN-REFERENCE.md),
> adalah pernyataan **niat** dan tetap berlaku sebagai spec. Kalau keduanya
> berbeda, **dokumen ini yang menggambarkan yang berjalan** — dan tiap selisihnya
> dicatat di [Lampiran](#lampiran--selisih-dengan-3-design-referencemd), bukan
> disembunyikan.

---

## 0. Cara pakai dokumen ini

Dokumen ini **tidak menciptakan aturan baru.** Ia mencatat aturan yang sudah
dijalankan kode dan ditegakkan test, lalu menunjuk sumber kebenarannya. Kalau ada
angka di sini yang berbeda dengan kode, kodenya yang benar dan dokumen ini yang
salah.

| Topik | Sumber kebenaran |
|---|---|
| Warna, radius, spacing, font | `apps/web/lib/tokens.ts` → dicerminkan `apps/web/app/globals.css` |
| Warna di HP | `apps/mobile/lib/tokens.ts` (+ ⚠️ `apps/mobile/tailwind.config.js`, lihat §10) |
| Mood / reaksi / intent / empty state | `packages/types/src/vocabulary.ts` + `packages/types/src/domain.ts` |
| Navigasi web | `apps/web/components/bottom-nav.tsx` (**bukan** `lib/navigation.ts` — file itu tidak ada) |
| Navigasi mobile | `apps/mobile/lib/navigation.ts` |
| Nilai konfigurasi & flag | `packages/database/src/config-defaults.ts` |

**Yang dikunci test.** Sebagian besar aturan di dokumen ini bukan konvensi — dia
assertion. Mengubahnya membuat CI merah, dan itu memang tujuannya:

| Berkas test | Yang dijaga |
|---|---|
| `apps/web/lib/contrast.test.ts` | Seluruh rasio kontras AA + jarak hue `danger` ≥25° |
| `apps/web/lib/css-tokens.test.ts` | `globals.css` ≡ `tokens.ts`, termasuk blok fallback `prefers-color-scheme` |
| `apps/mobile/lib/tokens.test.ts` | Token HP ≡ token web, radius, touch target |
| `apps/web/lib/vocabulary.test.ts` | Label ucapan unik, tiap nilai punya bentuk, reaksi bukan "like" |
| `apps/web/components/components.test.tsx` | Balon lawan bicara tidak lavender, urutan konsekuensi, isi nav |
| `apps/web/components/a11y.test.tsx` | axe atas 17 layar, tinggi tetap, `prefers-reduced-motion` |
| `apps/web/components/feed.test.tsx` | Tiap tile menuju rute yang ada |

Halaman `/dev/tokens` di web menampilkan seluruh swatch berikut rasio kontrasnya
yang terukur — pembanding kedua kalau dokumen ini dicurigai basi.

---

## 1. Suara & prinsip

### 1.1 Tone

Bahasa Indonesia, hangat, non-klinis. Menyapa dengan **kamu**, menyebut diri
**gue** saat berbicara sebagai produk. Menghindari nuansa rumah sakit, klinik,
dating, dan korporat (PRD §23, DESIGN-REF §0).

Kalimat yang paling mewakili produk ini ada di `apps/web/app/layout.tsx:31`:

> **Kadang kita nggak butuh solusi. Kita cuma butuh didengar.**

Dan di layar sambutan (`apps/web/lib/onboarding.ts`):

> **Di sini kamu nggak harus terlihat baik-baik saja.**

### 1.2 Copy nyata dari kode

Semuanya dikutip apa adanya, bukan karangan untuk dokumen ini.

| Konteks | Copy | Sumber |
|---|---|---|
| Hero landing | "Ada tempat buat cerita." / "Curhat dong, kapan pun kamu butuh didengar. Di sini, kamu nggak sendiri." | `apps/web/lib/landing.ts:20` |
| Sapaan siang | "Hai. Apa kabar hari ini?" | `packages/types/src/vocabulary.ts:115` |
| Sapaan Midnight | "Belum tidur? Kalau ada yang mau diceritain, gue di sini." | `packages/types/src/vocabulary.ts:116` |
| **Prompt Felt Heard** | "Setelah baca balasan yang masuk, kamu merasa didengar?" · "Jawaban kamu cuma buat kami, nggak kelihatan ke siapa pun." | `apps/web/components/safety.tsx:42` |
| Jawaban Felt Heard | "Iya, lumayan bikin lega" · "Sedikit" · "Belum, sih" | `apps/web/components/safety.tsx` |
| **Tombol dismiss** | terlihat: "Nggak sekarang" · dibacakan: "Lewati pertanyaan ini, jangan hitung sebagai jawaban" | `apps/web/components/safety.tsx:79` |
| Krisis L3 | "Kamu nggak sendirian." · "Kalau kamu mau ngomong sama orang sekarang" · tutup: "Aku mengerti, tutup" | `apps/web/components/supportive-intervention.tsx:74` |
| Krisis L3, tanpa hotline | "Kami lagi nggak punya daftar nomor bantuan yang sudah kami pastikan benar, dan kami nggak mau ngasih nomor yang salah ke kamu." | `apps/web/components/supportive-intervention.tsx:102` |
| Peringatan doxxing | "Sepertinya curhatanmu berisi informasi pribadi. Kamu yakin ingin membagikannya?" · centang: "Aku ngerti, dan tetap mau kirim." | `apps/web/lib/personal-data.ts:54` |
| Curhat ditahan | "Curhatmu kami tinjau dulu sebentar ya" · "Baru kamu yang bisa lihat ini. **Ini bukan hukuman.**" | `apps/web/app/(app)/post/[id]/page.tsx:261` (judulnya juga di `create-curhat.tsx:157`) |
| Curhat hilang | "Curhatnya udah nggak ada" · "Mungkin dihapus penulisnya, atau memang nggak pernah ada. Nggak apa-apa — masih banyak cerita lain." | `apps/web/app/(app)/post/[id]/page.tsx:235` |
| Jatah AI habis | "Jatah ngobrol sama DONG hari ini udah habis" · "**Bukan karena kamu kebanyakan cerita.** Besok jatahnya balik lagi — dan kalau malam ini masih berat, ada orang yang bisa dengerin." | `apps/web/components/dong-ai.tsx:159` |
| Mencari listener | "Lagi nyariin orang yang tepat buat dengerin kamu…" · "Kamu boleh tutup halaman ini — kalau ketemu, kami kabarin." | `apps/web/components/room.tsx:44` |
| Listener tak ketemu | "Belum ada yang bisa nemenin sekarang" · "**Bukan karena ceritamu nggak penting.** Malam-malam gini kadang yang lagi siap dengerin memang lagi sedikit." | `apps/web/components/room.tsx:83` |
| Burnout listener | "Hari ini kamu udah cukup 🤍" · "Kamu udah nemenin beberapa orang. Balik lagi kalau kamu udah pulih — **nggak ada yang ngitungin**." | `apps/web/components/listener.tsx:121` |
| Tawaran match | "Ada yang butuh didengar" · "Aku siap dengerin" / "Lagi nggak bisa" | `apps/web/components/listener.tsx:196` |
| Nudge listener | "Ada orang yang sedang butuh didengar." · "Kalau kamu lagi punya tenaga. **Kalau nggak, nggak apa-apa juga.**" | `apps/web/components/feed.tsx` |
| Sesi berakhir | "Makasih udah mau dengerin 🤍" (listener) / "Makasih udah mau cerita 🤍" (pencerita) | `apps/web/components/room.tsx:345` |
| Error auth | "Email atau password-nya nggak cocok. Coba cek lagi ya." | `apps/web/lib/auth-copy.ts:18` |
| Aturan main onboarding | "Nggak ada yang perlu diceramahi. Kalau nggak tahu mau bilang apa, 'aku dengerin' udah cukup." | `apps/web/lib/onboarding.ts` |
| Blokir | "Dia nggak diberi tahu kalau kamu memblokir." | `apps/web/components/safety.tsx:177` |
| Update paksa (HP) | "Perbarui dulu ya — ceritamu tetap ada, nggak ada yang hilang." | `apps/mobile/components/status-screens.tsx:63` |

Polanya konsisten dan layak ditiru saat menulis copy baru: **ketika produk
menolak sesuatu, dia menjelaskan bahwa penolakan itu bukan penilaian atas
orangnya.** "Ini bukan hukuman", "bukan karena kamu kebanyakan cerita", "bukan
karena ceritamu nggak penting", "nggak ada yang ngitungin".

### 1.3 Aturan produk yang mengikat UI

Empat hal ini bukan preferensi gaya. Melanggarnya mengubah arti produk.

1. **Reaksi selalu berupa kata, glyph hanya pendamping.** Enam glyph telanjang
   akan runtuh jadi rating — mata memilih favorit, hati jadi default, dan "aku
   pernah di situ" berubah jadi persetujuan (PRD §9). Dijaga
   `vocabulary.test.ts:106` (menolak label yang mengandung *like/suka/love/bagus/
   keren/setuju*) dan `:114` (tiap label wajib orang pertama).
2. **Hitungan reaksi bisa disembunyikan per pemanggil**, dan **default-nya
   tersembunyi**. Angka yang sama berarti dua hal berlawanan: di kartu feed ia
   terbaca "dua belas orang sudah merespons, kamu nggak dibutuhkan"; di halaman
   penulisnya sendiri ia terbaca "dua belas orang mendengarmu".
3. **Dismiss ≠ "Belum".** Prompt Felt Heard yang di-dismiss keluar dari metrik
   sepenuhnya. Kalau dihitung "belum", North Star berubah jadi ukuran seberapa
   mengganggu prompt-nya. Ketiga jawaban dirender **identik** — membuat "Belum,
   sih" lebih pelan dari "Iya" akan membengkokkan metrik lewat desain.
4. **Tidak ada angka follower, view, atau ranking di kartu curhat** (PRD §11).
   `CurhatCard` tidak punya field-nya sama sekali.

---

## 2. Warna

### 2.1 Tabel token — 19 token × 3 tema

Nilai identik di `apps/web/lib/tokens.ts`, `apps/web/app/globals.css`, dan
`apps/mobile/lib/tokens.ts`; kesamaannya dijaga dua test.

| Token | CSS var | **light** "Pagi Merah Muda" | **dark** "Malam Plum" | **midnight** |
|---|---|---|---|---|
| `bg` | `--color-bg` | `#fff5f8` | `#1a1020` | `#120a16` |
| `surface` | `--color-surface` | `#ffffff` | `#251729` | `#1a1020` |
| `surfaceAlt` | `--color-surface-alt` | `#ffe6ee` | `#33203a` | `#251729` |
| `border` | `--color-border` | `#f4cfdd` | `#4a2c46` | `#3a2340` |
| `text` | `--color-text` | `#2b1233` | `#f7e9f0` | `#efdde7` |
| `muted` | `--color-muted` | `#6b4257` | `#c9a9bb` | `#b898aa` |
| **`primary`** | `--color-primary` | `#c2185b` | `#ff86bb` | `#f582b4` |
| `primaryFg` | `--color-primary-fg` | `#ffffff` | `#1a1020` | `#120a16` |
| **`brand`** | `--color-brand` | `#fa4b7d` | `#ff9fca` | `#f596c2` |
| **`accentLavender`** | `--color-accent-lavender` | `#6d4ae0` | `#c4b0ff` | `#b7a2f5` |
| `accentAmber` | `--color-accent-amber` | `#ffb020` | `#ffc978` | `#f0bd72` |
| `accentFg` | `--color-accent-fg` | `#2b1233` | `#1a1020` | `#120a16` |
| `tintPink` | `--color-tint-pink` | `#ffdce7` | `#3d2138` | `#301a2c` |
| `tintLavender` | `--color-tint-lavender` | `#e9e1ff` | `#2f2650` | `#251d40` |
| `tintAmber` | `--color-tint-amber` | `#ffebcb` | `#3d3020` | `#302618` |
| `tintRose` | `--color-tint-rose` | `#ffd3e1` | `#452133` | `#361a28` |
| **`danger`** | `--color-danger` | `#7e2f0c` | `#ff9d80` | `#f0977c` |
| `dangerFg` | `--color-danger-fg` | `#ffffff` | `#1a1020` | `#120a16` |
| `focus` | `--color-focus` | `#c2185b` | `#ff86bb` | `#f582b4` |

Asalnya: ikon aplikasi `docs/curhatdong_logo_v2.png` — ground rose, balon bicara
periwinkle, hati pink, percik amber dan koral.

### 2.2 Aturan yang menopang seluruh palet

> **Rose dalam mikul aksi, pink terang mikul identitas.**

Ini bukan selera. Pink terang **secara fisik tidak bisa** membawa teks putih:

| Pasangan | Rasio | Putusan |
|---|---|---|
| Putih di atas `brand` `#FA4B7D` | **3.30:1** | ❌ Gagal teks normal (butuh 4.5) |
| Putih di atas `primary` `#C2185B` | **5.87:1** | ✅ Ini yang mikul aksi |
| `accentFg` `#2B1233` di atas `brand` | **5.15:1** | ✅ Pink sebagai isian **wajib** tinta gelap |
| `brand` vs `bg` | **3.09:1** | ✅ Cukup untuk teks besar, ikon, outline (ambang 3:1) |

Konsekuensinya tegas: **`brand` tidak akan pernah bisa jadi isian tombol
berteks putih.** Dia hidup di teks besar, ikon, outline, badge, dan wordmark.
Dijaga `contrast.test.ts:82` — yang justru meng-*assert* bahwa putih di atas
`#fa4b7d` **kurang dari** 4.5, supaya kegagalan itu tercatat sebagai fakta yang
disengaja, bukan kelalaian.

### 2.3 Kenapa `danger` bata bakar, bukan merah

Dengan `primary` magenta-rose, merah lama `#B3261E` hanya berjarak **11° hue** —
"Hapus" jadi kembaran "Kirim", dan kemiripan seperti itu yang membuat orang
menghapus sesuatu tanpa sengaja. `#7E2F0C` berjarak **42°** dan jelas lebih
gelap. Di dark/midnight ia digeser ke koral (`#ff9d80` / `#f0977c`, ±40°).

**Jarak minimum 25° dikunci** di `contrast.test.ts:179` untuk ketiga tema,
terhadap `primary` maupun `brand`. Merah hanya untuk aksi destruktif — ada test
yang menolak kalau ia dipakai ulang sebagai aksen.

### 2.4 Lavender = DONG AI — dan pembalikannya

**Lavender berarti "ini bukan manusia".** Berlaku di mana pun: tile DONG AI di
Beranda, ground layar `/ai`, balon chat AI, indikator mengetik, chip
kepribadian, ikon fitur di landing.

Dan pembalikannya yang **disengaja**: satu-satunya hal di layar AI yang menuju
**manusia** tetap rose —

- `BridgeCard` (`dong-ai.tsx:107`) — tawaran pindah ke listener manusia;
- `QuotaNotice` saat jatah habis (`dong-ai.tsx:151`) — yang mengarahkan ke orang.

Berbeda dari `brand`, **lavender boleh jadi isian tombol**: `primaryFg` di
atas `accentLavender` lolos 4.5:1 (`contrast.test.ts:125`).

> ### ⛔ Satu kebohongan visual yang sistem ini tidak boleh lakukan
>
> **Balon lawan bicara di room listener tidak boleh lavender.** Merender pesan
> seorang manusia dalam warna yang di seluruh produk berarti "ini bukan manusia"
> adalah satu-satunya kebohongan visual yang tidak boleh terjadi.
>
> Dikunci di `apps/web/components/components.test.tsx:226`: `<ChatBubble
> from="other" />` **tanpa** prop `tone` tidak boleh memuat `tint-lavender`.
> Karena itu `tone` default-nya `'human'` dan harus tetap begitu; `MessageList`
> di layar AI meng-hardcode `tone="ai"`, sementara `RoomTranscript` tidak
> mengirim `tone` sama sekali.

### 2.5 Elevation & wash

| Var | light | dark | midnight |
|---|---|---|---|
| `--shadow-card` | `0 1px 1px rgba(43,18,51,.04), 0 10px 26px -20px rgba(194,24,91,.55)` | `…rgba(0,0,0,.9)` | `…rgba(0,0,0,1)` |
| `--shadow-nav` | `0 -2px 30px -14px rgba(194,24,91,.5)` | `…rgba(0,0,0,.85)` | `…rgba(0,0,0,.95)` |
| `--wash-top` | `radial-gradient(130% 55% at 50% 0%, rgba(250,75,125,.22), transparent 70%)` | rose .16 | rose .10 |
| `--wash-ai` | `radial-gradient(…, rgba(109,74,224,.16), transparent 70%)` | lavender .14 | lavender .09 |

Bayangan kartu di light **berwarna rose**, bukan hitam — bayangan netral di atas
ground merah muda terbaca kotor. `--wash-top` dipakai di `/home`, `/auth`, dan
landing; `--wash-ai` hanya di `/ai`.

### 2.6 Pemilihan tema & Midnight Mode

Selector: atribut **`[data-theme='dark']` / `[data-theme='midnight']`** pada
`<html>` — atribut, bukan class.

**Urutan penentuan di web** (`apps/web/components/theme-script.tsx`, inline di
`<head>` sebelum paint supaya tidak berkedip):

1. `localStorage['curhat-theme']` bernilai `light` atau `dark` → pakai itu, henti.
2. `system`/kosong → jam ≥21 atau <4 → `midnight`; kalau tidak, ikut
   `prefers-color-scheme`.
3. Gagal total → jatuh ke media query CSS.

**Blok fallback `prefers-color-scheme`** (`globals.css:124`) ada untuk pembaca
tanpa pilihan tersimpan **dan tanpa JS**; isinya salinan penuh palet dark, dan
`css-tokens.test.ts:66` memastikan salinan itu identik.

**Midnight hanya menggantikan dark.** User yang memilih light tetap light, jam
berapa pun. Meredupkan layar seseorang karena jam, melawan setelan yang dia pilih
sendiri, adalah app yang merasa lebih tahu. Diuji dua arah
(`contrast.test.ts:235`). Jendelanya `MIDNIGHT_WINDOW = { startHour: 21, endHour: 4 }`,
sejajar `ui.midnight_mode_start/end` di `app_configs`.

Di dark, `primary` **dibalik**: isian rose terang dengan tinta gelap — tombol
rose tersaturasi di atas ground gelap tidak bisa membawa teks putih di AA.

---

## 3. Bentuk, ukuran, tipografi

### 3.1 Radius

```
--radius-curhat: 1.25rem   /* 20px — kartu, sheet, modal, input */
--radius-action: 999px     /* pill penuh — tombol utama & FAB */
--radius-chip:   999px     /* chip, badge, pill nav, tab feed */
```

`RADII` di TS: `sm 0.5rem` · `md 0.75rem` · `lg 1.25rem` (kartu) · `xl 999px` ·
`full 9999px`. Kartu dinaikkan ke 20px di E18-T01 — ujung atas rentang 16–20px
§0, karena kartu feed adalah tempat "ini punya ruang buat bernapas" benar-benar
terasa. **Input tetap memakai radius kartu, bukan pill.**

`--radius-action` jadi pill penuh sejak revisi brand mock — satu token yang
me-restyle semua tombol aksi sekaligus.

### 3.2 Spacing & target sentuh

`SPACING`: `xs .25rem` · `sm .5rem` · `md .75rem` · `lg 1rem` · `xl 1.5rem` ·
`2xl 2rem`. Gutter `--spacing-gutter: 1.25rem` (20px).

**`--size-touch: 2.75rem` (44px)** — `MIN_TOUCH_TARGET_PX = 44`, dan berlaku juga
untuk tombol reaksi. Enam ketukan kecil berderet persis tempat target minimum
berhenti jadi teori. Mobile mencerminkannya: `TOUCH_TARGET = 44`,
`spacing.touch: 44px`.

### 3.3 Tipografi

**Nunito** lewat `next/font/google` (`apps/web/app/layout.tsx:14`) — bobot
400/600/700/800/900, subset latin, `display: swap`. Diunduh saat build dan
di-self-host: **nol request ke pihak ketiga**.

> Catatan sejarah: `globals.css` sudah menamai Nunito sejak E15-T01, tapi file
> fontnya tidak pernah ada — teks jatuh ke fallback sistem sampai revisi brand
> mock benar-benar memuatnya.

Sans membulat, dan itu memang maksudnya: sans geometris yang dipakai setiap
dashboard SaaS akan membuat produk ini terasa seperti perangkat lunak, bukan
tempat bercerita.

Skala tipe **teramati dari penggunaan**, bukan tabel token:

| Peran | Kelas | Ukuran |
|---|---|---|
| Hero landing | `text-[40px] sm:text-[56px]` `font-black` `tracking-[-0.03em]` | 40 / 56px |
| Judul seksi landing | `text-3xl font-black` | 30px |
| H1 dalam app (sapaan) | `text-[27px] font-black` | 27px |
| Judul langkah onboarding | `text-[26px] font-black` | 26px |
| `Heading` mobile | `text-[26px] font-black` | 26px |
| H2 dalam app | `text-xl font-black` | 20px |
| Judul kartu curhat | `text-[17px] font-bold` | 17px |
| Judul sheet / empty state | `text-base` | 16px |
| Body / mayoritas UI | `text-sm leading-relaxed` | 14px |
| Metadata, byline, badge | `text-xs` | 12px |
| Label rail desktop | `lg:text-[15px]` | 15px |
| Label nav HP | `text-[11px]` | 11px |

Heading memakai `letter-spacing: -0.022em` + `text-wrap: balance`.

---

## 4. Kosakata

Sumber: `packages/types/src/vocabulary.ts` (glyph, label ucapan, bentuk) +
`domain.ts` (kata). Web me-re-export, mobile mengimpor langsung — **satu salinan
untuk dua platform**, karena dua salinan akan melenceng pada edit pertama.

Tiap nilai punya **`ChipShape`** (`round | square | notch | pill`) supaya arti
tidak pernah dibawa warna saja. Bentuk diberikan menurut keluarga emosi: berat →
bulat, gelisah → bertakik, datar → kotak, ringan → pill.

### 4.1 Sebelas mood (PRD §7)

| enum | Label | Glyph | Dibacakan | Bentuk |
|---|---|---|---|---|
| `sedih` | Sedih | 😔 | Mood: sedih | round |
| `marah` | Marah | 😤 | Mood: marah | notch |
| `cemas` | Cemas | 😰 | Mood: cemas | notch |
| `capek` | Capek | 😮‍💨 | Mood: capek | round |
| `patah_hati` | Patah hati | 💔 | Mood: patah hati | round |
| `kosong` | Kosong | 🫥 | Mood: hampa atau kosong | square |
| `overthinking` | Overthinking | 🌀 | Mood: overthinking | notch |
| `lega` | Lega | 🌤️ | Mood: lega | pill |
| `senang` | Senang | 🙂 | Mood: senang | pill |
| `bersyukur` | Bersyukur | 🤍 | Mood: bersyukur | pill |
| `bingung` | Bingung | 😕 | Mood: bingung | square |

### 4.2 Enam reaksi (PRD §9) — kata, bukan like

| enum | Label terlihat | Glyph | Dibacakan | Bentuk |
|---|---|---|---|---|
| `aku_ngerti` | Aku ngerti | 🤝 | Beri reaksi: aku ngerti | pill |
| `peluk_virtual` | Peluk virtual | 🫂 | Beri reaksi: peluk virtual | round |
| `aku_dengerin` | Aku dengerin | 👂 | Beri reaksi: aku dengerin | pill |
| `aku_pernah_di_situ` | Aku pernah di situ | 🪞 | Beri reaksi: aku pernah di situ juga | square |
| `tetap_kuat` | Tetap kuat | 🌱 | Beri reaksi: tetap kuat | notch |
| `cerita_lagi` | Cerita lagi | 💬 | Beri reaksi: cerita lagi kalau mau | pill |

Tidak ada like, love, atau jempol. Tidak ada satu reaksi yang mengungguli yang
lain. Label yang dibacakan sengaja **lebih panjang** dari label terlihat —
"Peluk virtual" terbaca wajar di sebelah glyph pelukan, tapi diucapkan sendirian
ia ambigu.

### 4.3 Empat intent (PRD §7)

| enum | Label | Glyph | Dibacakan | Bentuk |
|---|---|---|---|---|
| `cuma_didengar` | Aku cuma mau didengar | 👂 | Yang dicari: cuma mau didengar | pill |
| `butuh_saran` | Aku butuh saran | 💡 | Yang dicari: butuh saran | square |
| `butuh_dukungan` | Aku butuh dukungan | 🫂 | Yang dicari: butuh dukungan | round |
| `pernah_ngalamin` | Ada yang pernah ngalamin? | 🙋 | Yang dicari: ada yang pernah ngalamin? | notch |

### 4.4 Delapan empty state

Hangat dan kontekstual, tidak pernah "No data" — layar kosong adalah momen orang
paling mungkin menutup aplikasi, dan pesan sistem tidak pantas di situ.

| Key | Judul | Aksi |
|---|---|---|
| `feed` | Belum ada yang cerita di sini. | Mulai curhat |
| `butuhDidengar` | Semua cerita di sini udah dapat balasan. | — |
| `untukKamu` | Belum ada yang cocok buat kamu. | Atur topik |
| `comments` | Belum ada yang balas. | — |
| `notifications` | Belum ada notifikasi. | — |
| `search` | Nggak ketemu. | Ke Explore |
| `rooms` | Belum ada ruang ngobrol. | Cari listener |
| `aiConversations` | Belum ada obrolan. | Mulai ngobrol |

Dijaga test: judul unik antar konteks, tidak memuat *no data/empty/error*, judul
diakhiri tanda baca, body >20 karakter, dan body pencarian tidak menyalahkan
pembacanya.

### 4.5 Kosakata lain (`domain.ts`)

- **10 kategori laporan** — Bullying, Pelecehan, Konten seksual, Ujaran
  kebencian, Ancaman, Penipuan, Penyebaran data pribadi, Spam, Konten berbahaya,
  Lainnya. Tiga di antaranya mendesak: `threat`, `dangerous_content`, `sexual`.
- **Felt Heard**: `yes` / `somewhat` / `no`.
- **5 kepribadian AI**: Pendengar, Pemikir, Teman Hangat, Teman Santai, Journal
  Companion (yang terakhir Phase 2, disembunyikan).
- **4 tab feed**: `untuk-kamu`, `terbaru`, `butuh-didengar`, `topik`.
- **15 kategori awal**: Hubungan, Pernikahan, Keluarga, Kerjaan, Karier,
  Keuangan, Pertemanan, Kesepian, Percaya Diri, Kuliah, Jadi Orang Tua, Usaha,
  Kehilangan, Random, Cerita Baik.

---

## 5. Pustaka komponen

### 5.1 Web

Semua di `apps/web/components/`. **Tidak ada subdirektori `ui/`** — primitif ada
di satu file datar `ui.tsx`. `packages/ui` adalah direktori kosong (§11).

**Primitif — `ui.tsx`**

| Komponen | Varian / props | Catatan |
|---|---|---|
| `Wordmark` | `tone: 'brand' \| 'mono'` | `brand` = "dong" di pill `bg-brand` dengan tinta gelap, **tidak pernah putih**. `mono` dipakai di rail desktop supaya tidak berteriak di atas 8 ikon monokrom |
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost'`; jadi `<a>` bila diberi `href` | `min-h-[var(--size-touch)] rounded-[var(--radius-chip)] px-6 font-bold` |
| `Card` | `as`, `lifted`, `aria-labelledby` | `lifted` memakai `border-transparent` + shadow supaya box model-nya identik dengan kartu ber-border |
| `Input` / `Textarea` | props native | Satu string kelas bersama; radius **kartu**, bukan pill |
| `Badge` | `tone: 'brand' \| 'amber' \| 'lavender' \| 'muted'` | brand & amber wajib `text-accent-fg` |

**Kartu & interaksi**

| Komponen | Berkas | Catatan |
|---|---|---|
| `CurhatCard` | `curhat-card.tsx` | **4 varian**: `default` · `butuh-didengar` (tepi amber + kalimat "Belum banyak yang balas…") · `anonymous` (prefiks sr-only "Ditulis anonim, kode ") · `held` (border putus-putus + "Curhatmu kami tinjau dulu sebentar ya"). Urutan: mood+intent dulu, byline, judul, kutipan. Jumlah balasan ditulis **dengan kata** saat nol |
| `ReactionBar` | `reaction-bar.tsx` | 6 pill, `showCounts=false` **default**. Keadaan terpilih ditandai border + bobot font + `aria-pressed`, bukan warna saja |
| `ReactionPicker` | `reaction-bar.tsx` | Sheet tekan-lama. Baris selebar penuh, **sengaja bukan strip glyph rapat**. Memuat "Nggak ada yang lebih penting dari yang lain. Pilih yang paling jujur." |
| `MoodChip` / `IntentBadge` | `chips.tsx` | Mood **terisi**, intent **outline** — supaya pasangannya terbaca sebagai dua jenis fakta berbeda |
| `MoodPicker` / `IntentSelector` | `chips.tsx` | `role="radiogroup"`, terpilih = ring + `aria-checked` |
| `CategoryChip` / `CategorySheet` | `chips.tsx` | Sheet memakai `role="listbox"`, bukan `<select>` native, karena menampilkan jumlah curhat aktif |
| `CommentItem` | `conversation.tsx` | Nesting **dipaksa satu level**. Badge "membantu" terisi amber |
| `ChatBubble` | `conversation.tsx` | `from: 'self' \| 'other'`, **`tone: 'human' \| 'ai'` (default `human`)**. Sudut ekor dikotakkan per sisi — bentuk, bukan warna saja. Streaming: `aria-live="polite"` + `aria-busy`, karet `▍` sebagai sibling `aria-hidden` |
| `ListenerCard` | `conversation.tsx` | Ketersediaan = titik **plus** kata. Felt-heard ditulis sebagai kalimat ("82% orang yang ngobrol sama dia merasa didengar."), tidak pernah skor telanjang |
| `EmptyState` | `conversation.tsx` | Mengambil copy dari `EMPTY_STATES` bersama |

**Navigasi & chrome**

| Komponen | Berkas | Catatan |
|---|---|---|
| `BottomNav` | `bottom-nav.tsx` | **Satu komponen, dua bentuk** (bar HP + rail desktop) — dua komponen berarti dua landmark dan dua urutan tab untuk tujuan yang sama |
| FAB | `bottom-nav.tsx` | `min-h-14 min-w-14 aspect-square` (bukan kotak 56px tetap). Satu `aria-label`, dua span `aria-hidden` |
| `AppChrome` | `app-chrome.tsx` | Membungkus grup rute `(app)`. Nav disembunyikan di `/auth`, `/onboarding`, `/room/*`, `/moderation/*` |
| Ikon | `icons.tsx` | 9 ikon SVG monokrom `currentColor`, stroke 1.75, semuanya `aria-hidden` + `focusable="false"`. Menggantikan emoji di E18-T03 |

**Safety — `safety.tsx`**

| Komponen | Aturan yang dikodekan |
|---|---|
| `FeltHeardSheet` | Ground `tint-pink`; tiga jawaban **bergaya identik**; dismiss di bawah garis pemisah |
| `ReportSheet` | 10 kategori sebagai radiogroup; catatan opsional 1000 karakter; submit mati sampai kategori dipilih |
| `BlockDialog` | 4 baris konsekuensi dirender sebelum tombol |
| `SafetyResourceCard` | Membangun href `tel:` / `wa.me`; seluruh kartu satu `<a>` dengan label tersusun |
| `DestructiveConfirm` | **Konsekuensi selalu di atas tombol** (dicek lewat posisi DOM). `confirmPhrase` menuntut ketikan persis — "sebuah checkbox cuma satu ketukan" |

**Per layar**: `landing.tsx`, `auth.tsx`, `onboarding.tsx`, `feed.tsx`,
`create-curhat.tsx`, `dong-ai.tsx`, `listener.tsx`, `room.tsx`,
`supportive-intervention.tsx`, `legal-placeholder.tsx`, `google-signin.tsx`,
`turnstile.tsx`, `theme-script.tsx`.

### 5.2 Mobile — dua berkas

`apps/mobile/components/` hanya berisi:

- **`ui.tsx`** — `Screen`, `ScreenScroll`, `Heading`, `Body`, `PrimaryButton`,
  `SecondaryButton`, `MoodChip`, `IntentBadge`, `ReactionBar`, `CurhatCard`,
  `EmptyState`, `ErrorText`, `Loading`.
- **`status-screens.tsx`** — `OfflineBanner`, `MaintenanceScreen`,
  `ForceUpdateScreen`, `Toast`.

Kedalaman ditangani berbeda: RN tidak bisa mewarnai bayangan Android di bawah API
28, jadi `LIFT` memakai `elevation: 2` + bayangan hitam, bukan bayangan rose web.

**Yang belum ada di HP**: `ChatBubble`, `CommentItem`, `ListenerCard`,
`MoodPicker`, `IntentSelector`, `CategorySheet`, `ReactionPicker`, dan **seluruh
komponen safety**. Layar mobile yang membutuhkannya menyusunnya inline.

---

## 6. Aksesibilitas sebagai aturan yang dieksekusi

PRD §23.1 memperlakukan aksesibilitas sebagai **acceptance criteria, bukan
polish**. Karena itu tiap aturan berpasangan dengan test.

| Aturan | Ditegakkan di |
|---|---|
| **Glyph selalu `aria-hidden`**; pembungkusnya membawa `role="img"` + `aria-label` | `vocabulary.test.ts:59`, `a11y.test.tsx:254` |
| Label ucapan **tidak boleh sama dengan glyph**, wajib berawalan `Mood:` / `Beri reaksi:` / `Yang dicari:` | `vocabulary.test.ts:59` |
| **Tiap label ucapan dalam satu grup unik** | `vocabulary.test.ts:76` |
| **Tiap nilai punya bentuk**, dan tiap grup memakai **lebih dari satu** bentuk | `vocabulary.test.ts:87`, `:95` |
| Tidak ada tinggi tetap pada kotak berteks (`h-14` + `text-*` ditolak; `min-h-*` boleh) | `a11y.test.tsx:310` |
| Tidak ada `whitespace-nowrap` di teks | `a11y.test.tsx:332` |
| Tidak ada handler klik di elemen non-fokusabel | `a11y.test.tsx:291` |
| `prefers-reduced-motion` mematikan animasi **dan** transisi | `a11y.test.tsx:342`, `globals.css:322` |
| Cincin fokus terlihat, ≥3:1 di semua ground | `a11y.test.tsx:353`, `contrast.test.ts:191` |
| Target sentuh ≥44px | `ui.test.tsx:33`, `contrast.test.ts:275` |
| **axe nol pelanggaran atas 17 layar** | `a11y.test.tsx:244` |
| Tiap kartu/tile menyebut **item mana** ("Baca curhat: {judul}") | `components.test.tsx:163` |
| Kontrol nonaktif menyebutkan alasannya ("Komunitas — belum tersedia") | `components.test.tsx:321` |
| Hitungan diucapkan, bukan cuma digambar ("Notifikasi, 3 belum dibaca") | `components.test.tsx:342` |

Dua hal yang **sengaja tidak diandalkan**: aturan kontras axe dimatikan (jsdom
tidak punya warna terkomputasi, jadi lolos di sana tidak berarti apa-apa —
kontras diperiksa numerik), dan perilaku screen reader sungguhan berada di luar
otomasi.

> `docs/A11Y-AUDIT-E15.md` menutup dengan kalimat yang layak diingat:
> **"Test di repo ini tidak membuktikan aplikasinya aksesibel."** TalkBack,
> penskalaan 200% di browser sungguhan, dan uji perangkat belum pernah
> dijalankan.

---

## 7. Navigasi

Tiga bentuk, dan **web serta mobile tidak sepakat**.

| | Slot |
|---|---|
| **Bar HP web** (5 + FAB) | Beranda · DONG AI · Komunitas *(nonaktif)* · Notifikasi · Akun |
| **Rail desktop web** (8) | Beranda · DONG AI · Komunitas · Notifikasi · Cari Listener · Jelajah · Cari · Akun |
| **Tab mobile** (4 + FAB) | Home · Explore · [+ CURHAT] · Listen · Profil |

`NAV_ITEMS` ada di `apps/web/components/bottom-nav.tsx:77` — item dengan
`onPhone: false` (`listener`, `explore`, `cari`) **keluar dari urutan tab** di HP,
bukan cuma tersembunyi. `komunitas` membawa `href: ''` supaya tidak pernah bisa
jadi tautan mati; ia dirender nonaktif dengan label "Komunitas — belum tersedia"
selama `communities.enabled` masih `false`.

Rail desktop lahir di E18: DESIGN-REF §1 menyebutnya sejak awal tapi tidak pernah
dibangun. Karena rail memuat 8 tujuan, tile "Fitur Utama" dan kartu DONG AI
**hilang di `lg`** — mereka hanya ada karena bar HP cuma muat 5 slot.

### ⚠️ Keputusan produk yang belum pernah diambil

Dikutip verbatim dari `apps/mobile/lib/navigation.ts:16`:

> *"This is still a product decision nobody has actually made — it fell out of two
> documents disagreeing, and E18-T02 made the gap wider without closing it."*

Mobile mengikuti DESIGN-REF §1 dan PRD §23; web mengikuti brand mock. Keduanya
kini hanya berbagi **dua konsep** (beranda dan profil) — dan bahkan itu memakai
label berbeda ("Home"/"Profil" vs "Beranda"/"Akun"). Orang yang pindah dari
aplikasi HP ke browser menemukan set tab yang berbeda dalam urutan berbeda.

**Salah satunya harus berubah.** Ini keputusan tentang produk, bukan tentang bar
navigasi, dan sengaja dicatat alih-alih dipilih diam-diam.

---

## 8. Peta layar

### 8.1 Web — 22 halaman

**Publik** (tanpa sesi, tanpa chrome):

| URL | Berkas | Catatan |
|---|---|---|
| `/` | `app/page.tsx` | **Satu-satunya halaman yang boleh terindeks.** Preview feed-nya **contoh yang ditulis sendiri** (`createdAtLabel: 'Contoh'`), tidak pernah curhat asli, dan halaman ini tidak memanggil API saat render |
| `/legal/privacy` · `/legal/terms` · `/legal/guidelines` | `app/legal/*` | Ketiganya masih `LegalPlaceholder` dan tetap `noindex` sampai naskah hukum ada (E17-T10) |
| `/dev/tokens` | `app/dev/tokens/page.tsx` | Referensi token: swatch tiap tema + rasio kontras tercetak |

**Grup `(app)`** — dibungkus `SessionProvider` → `AppChrome`:

| URL | Keadaan yang dirender |
|---|---|
| `/auth` | Enam langkah: `login → email → otp → password-create → age → blocked`. Default email+password (login yang tidak mengirim email); OTP tetap jalur daftar & pemulihan |
| `/onboarding` | Tujuh langkah, **satu submit atomik**. Langkah 1–2 boleh dilewati. Konsen dikirim granted **atau** refused |
| `/home` | Sapaan personal → kartu "Mulai curhat" + maskot → rak "Fitur Utama" (`lg:hidden`) → nudge listener → kartu DONG AI (`lg:hidden`) → tab feed → daftar. Skeleton, empty per tab, banner offline |
| `/curhat/baru` | **Rute, bukan modal**, supaya draft selamat dari refresh. Autosave draft, peringatan doxxing sambil mengetik |
| `/post/[id]` | Lima keadaan: memuat · hilang/dihapus · **ditahan** (khusus penulis) · komentar dikunci · normal |
| `/ai` | SSE token demi token; balon baru masuk daftar saat `message.complete`. Disclaimer **di luar thread** supaya tidak pernah tergulir hilang |
| `/listen` | Mesin keadaan: belum aktif → gate panduan · aktif → dashboard + toggle · ada tawaran → modal. Tawaran **di-poll tiap 10 detik**, socket hanya optimasi. ⚠️ **Yatim** — lihat §11 |
| `/listener/request` | `form → searching → failed`. Melanjutkan pencarian yang masih berjalan |
| `/room/[id]` | `chat → feedback → thanks`. Socket + POST dengan rekonsiliasi echo lokal. **Layar penuh, nav disembunyikan** |
| `/notifications` | Merender persis yang dikirim API; **tidak pernah** mengambil target untuk memperkaya baris |
| `/search` | Tiga tab. Riwayat pencarian **hanya di perangkat** — tidak ada endpoint yang menerimanya |
| `/explore` | Grid topik + jumlah curhat aktif. Sengaja **tidak** diwarnai per topik |
| `/profile` | Redirect: authenticated → profil sendiri · anonymous → `/auth` · onboarding → `/onboarding` |
| `/profile/[alias]` | alias, avatar, bio, badge listener, tanggal gabung, jumlah membantu. **Tanpa email/telepon/provider id/follower/skor** |
| `/settings` | Akun · notifikasi (6 tipe, `safety` & `account` terkunci) · tema (`system` ditampilkan **dua swatch** karena jadi Midnight setelah jam 21) · tautan data & legal |
| `/settings/data` | Konsen, ekspor, penghapusan. Konsekuensi **ditulis server**, konfirmasi wajib diketik |
| `/moderation/actions` | Persis satu dari lima keadaan per baris. Identitas moderator tidak pernah ditampilkan. **Nav disembunyikan** |

### 8.2 Mobile — 15 layar

`_layout.tsx` melakukan routing auth di atas segalanya, menghitung ulang tema tiap
60 detik supaya Midnight berganti mengikuti jam dinding, dan menggerbangi seluruh
app pada `AppStatus` (`force_update` → layar update, `maintenance` → layar
perbaikan).

| Rute | Catatan |
|---|---|
| `(tabs)/index` | Feed. `FlatList` + **pull-to-refresh asli** (idiom platform; web sengaja tidak) |
| `(tabs)/explore` | Daftar topik |
| `(tabs)/listen` | Gate panduan · ketersediaan · tawaran. Hitung mundur dihitung dari `expiresAt`, bukan dari 60 — layar bisa terbuka dari notifikasi beberapa detik terlambat |
| `(tabs)/profile` | **Profil sendiri saja** — tidak ada `/profile/[alias]` di HP |
| `auth` | Enam langkah yang sama; copy-nya dijaga **byte-identik** dengan web oleh `auth-copy.test.ts` |
| `onboarding` | Tujuh langkah yang sama |
| `curhat/baru` | Layar penuh. Hasil sebagai layar terpisah: `idle \| published \| held \| intervention` |
| `post/[id]` | ⚠️ ditahan / dihapus / tidak pernah ada **melebur jadi satu layar** bagi siapa pun selain penulis |
| `ai/index` | Memakai **`expo/fetch`**, bukan `fetch` RN — RN tidak punya `response.body`, dan tanpa itu streaming mustahil |
| `room/[id]` | `FLAG_SECURE` dipasang malas lewat `expo-screen-capture`; modul native yang hilang ditoleransi, bukan bikin crash. Pemberitahuannya **tidak pernah menjanjikan** screenshot mustahil |
| `listener/request` | `form \| searching \| failed` |
| `notifications` | Aturan tanpa-isi yang sama; ketukan lewat `resolveDeepLink` |
| `settings/index` · `settings/data` · `moderation/actions` | Sejajar web |

**Tidak ada di HP**: pencarian, profil publik orang lain, halaman legal.

### 8.3 Admin — scaffold

`apps/admin/` berisi **satu halaman**: judul "Dashboard" dan kalimat *"Shell admin
siap. Metrik, moderation queue, dan banding menyusul di E14."*

`ADMIN_NAV` (`apps/admin/lib/navigation.ts`) mendaftar **13 entri** — Dashboard,
Moderation, Banding, Users, Content, Listeners, Kategori, Support Resources, AI
Config, Notifikasi, Analytics, Audit Log, Settings — dan **seluruhnya menuju rute
yang tidak ada.** `minRole` di situ murni metadata tampilan; otorisasi ditegakkan
di API.

> DESIGN-REF §3 menyebut **14** halaman; nav yang terbangun punya 13. Satu
> halaman yang direncanakan tidak punya entri nav.

API-nya sendiri **lengkap** (E14, 15/15 task) — yang belum ada hanya UI-nya, dan
itu tidak masuk hitungan epic mana pun.

---

## 9. Fitur per domain

| Domain | Modul API | Permukaan web | Permukaan mobile |
|---|---|---|---|
| Auth (OTP + password + Google) | `modules/auth/` | `/auth` | `auth.tsx` |
| Onboarding & konsen | `modules/users/onboarding.*` | `/onboarding` | `onboarding.tsx` |
| Composer & feed | `modules/posts/`, `modules/feed/` | `/curhat/baru`, `/home` | `curhat/baru.tsx`, `(tabs)/index` |
| Reaksi / komentar / Felt Heard | `modules/reactions/`, `comments/`, `felt-heard/` | `/post/[id]`, `/room/[id]` | `post/[id].tsx` (tanpa sheet berdiri sendiri) |
| Safety & intervensi | `modules/safety/` | `supportive-intervention.tsx`, `safety.tsx` | inline di `curhat/baru.tsx` |
| DONG AI | `modules/ai/` | `/ai` | `ai/index.tsx` |
| Listener & matching | `modules/listener/` | `/listen`, `/listener/request` | `(tabs)/listen`, `listener/request` |
| Room privat | `modules/chat/` | `/room/[id]` | `room/[id].tsx` |
| Notifikasi | `modules/notifications/` | `/notifications`, `/settings` | `notifications.tsx`, `settings/` |
| Pencarian | `modules/search/` | `/search` | **tidak ada** |
| Explore | `modules/feed/` | `/explore` | `(tabs)/explore` |
| Profil | `modules/profiles/` | `/profile/[alias]` | `(tabs)/profile` (sendiri saja) |
| Setelan & ekspor/hapus | `modules/users/` | `/settings`, `/settings/data` | `settings/` |
| Moderasi & banding | `modules/moderation/` | `/moderation/actions` | `moderation/actions.tsx` |

### 9.1 Safety level — bentuk UI-nya

| Level | Arti | Yang terjadi di layar |
|---|---|---|
| **L0** | Normal | Terbit |
| **L1** | Sensitif | Terbit + dipantau |
| **L2** | Potensi bahaya | **Ditahan.** Penulis melihat kartu putus-putus: "Curhatmu kami tinjau dulu sebentar ya… Ini bukan hukuman." |
| **L3** | Risiko langsung | **Tidak pernah menghukum.** Layar Supportive Intervention: "Kamu nggak sendirian.", sumber bantuan, lalu dua jalan keluar lembut ("Ngobrol sama DONG AI" / "Cari Listener sekarang") |

Layar L3 punya penjaga copy: `FORBIDDEN_TONE` menolak kata *skor, level,
diagnos, melanggar, diblokir, sanksi*. Orang dalam krisis tidak sedang membaca
keputusan sistem tentang dirinya.

Kategori L3 wajib: `self_harm`, `threat`, `violence`, `sexual` — dan `self_harm`
ditahan pada ambang **lebih sensitif** dari yang lain.

> ⚠️ **Daftar hotline masih kosong.** Layar krisis menampilkan fallback jujur —
> "Kami lagi nggak punya daftar nomor bantuan yang sudah kami pastikan benar,
> dan kami nggak mau ngasih nomor yang salah ke kamu." — bukan layar kosong.
> Tapi E17-T12 tetap blocker rilis.

### 9.2 Feature flag

| Flag | Nilai | UI yang bereaksi |
|---|---|---|
| `communities.enabled` | `false` | **Satu-satunya yang terlihat**: slot Komunitas dirender nonaktif dengan label jujur |
| `journal.enabled` | `false` | Tidak ada UI Jurnal di mana pun |
| `ai.personality.journal_companion` | `false` | Disembunyikan dari `PersonalityPicker` |
| `feed.following_tab` | `false` | Tab "Following" tidak dirender |
| `listener.matching_enabled` | `true` | Kill switch matching |
| `ai.chat_enabled` | `true` | Kill switch percakapan AI (analisis safety tetap jalan) |

Kegagalan database **menurunkan ke default terdokumentasi**, bukan `undefined` —
yang akan terbaca "mati" di mana-mana.

### 9.3 Nilai konfigurasi yang membentuk UI

`felt_heard`: maks 1×/post, 3×/hari, **jeda 30 menit** setelah respons manusia
pertama · `listener`: maks 3 sesi bersamaan, 8/hari, pengingat istirahat setelah 3 ·
`matching.offer_ttl_seconds: 60` · `ai.messages_per_day: 50` · `notification`
quiet hours **22:00–07:00** · **`ui.midnight_mode_start: 21`, `end: 4`** ·
`room.idle_timeout_minutes: 30`.

---

## 10. Mobile: keadaan sekarang & celah untuk revisi

APK build #7 sudah terpasang di perangkat asli dan **berjalan normal tanpa
crash**. Bab ini mendaftar selisih web↔mobile yang ditemukan saat memetakan kode,
berurut menurut dampaknya terhadap pengalaman. Semuanya **dicatat, belum
diperbaiki**.

### 🔴 Prioritas tinggi

**1. NativeWind di HP hanya bertema gelap.**
`apps/mobile/tailwind.config.js:22-41` meng-hardcode hex tema **dark** sebagai
nama token (`bg: '#1a1020'`, `primary: '#ff86bb'`, …). Artinya `bg-bg`,
`text-text`, `bg-primary` di HP **tidak pernah berubah**. `tokensFor(theme)`
hanya dipakai sebagai inline style di beberapa tempat (`_layout.tsx`).
**Praktisnya: tema light dan midnight nyaris tidak sampai ke layar HP** — padahal
Midnight Mode adalah fitur produk (PRD §23), dan `apps/mobile/lib/theme.ts`
menghitungnya dengan benar setiap 60 detik untuk kemudian hampir tidak dipakai.

**2. Tab bar meng-hardcode `THEMES.dark`.**
`apps/mobile/app/(tabs)/_layout.tsx:21` — `const tokens = THEMES.dark;` apa pun
tema yang aktif.

**3. FAB mobile memakai ukuran tetap.**
`_layout.tsx:60` — `h-16 w-16 -ml-8`. Ini **persis pola yang web sudah
perbaiki** jadi `min-h-14 min-w-14 aspect-square` (E15-T17), karena lingkaran
berukuran tetap memotong glyph-nya sendiri saat teks diskalakan 200%. Bug yang
sama masih hidup di HP.

**4. `ReactionBar` mobile merender glyph tanpa kata.**
`apps/mobile/components/ui.tsx:204`. Di web, kata yang terlihat justru **penahan
yang membuat reaksi tidak runtuh jadi "like"** (PRD §9, §1.3 dokumen ini). Di HP
penahan itu tidak ada — yang tampil enam glyph telanjang.

### 🟡 Prioritas sedang

**5. Ikon tab masih emoji.** `TABS` membawa 🏠 🧭 👂 👤, dirender sebagai `<Text>`.
Web sudah pindah ke ikon stroke monokrom di E18-T03 dengan alasan yang berlaku
sama di HP: tiap platform menggambar emoji-nya sendiri, mereka membawa warna
sendiri ke palet yang memakai warna untuk menyampaikan arti, dan pada 18px mereka
jadi bubur. Butuh `react-native-svg` (dependency native, belum terpasang).

**6. Komponen yang belum ada.** Tidak ada `ChatBubble`, `CommentItem`,
`ListenerCard`, `MoodPicker`, `IntentSelector`, `CategorySheet`,
`ReactionPicker`, maupun komponen safety. Layar yang butuh menyusunnya inline —
artinya aturan seperti "balon lawan bicara tidak boleh lavender" **tidak dijaga
test apa pun di HP.**

**7. `EmptyState` mobile menerima string mentah** (`title`/`body`/`actionLabel`)
alih-alih `EmptyStateKey` dari `EMPTY_STATES` bersama. Copy empty state HP bisa
melenceng dari web tanpa ada yang tahu.

**8. Outline lebih tebal.** `border-2 border-brand` di HP vs `border-[1.5px]` di
web.

**9. Tidak ada layar pencarian dan tidak ada profil publik orang lain.**

**10. `post/[id]` melebur tiga keadaan** (ditahan / dihapus / tidak pernah ada)
jadi satu layar bagi siapa pun selain penulis. Web memisahkannya.

**11. Midnight tidak pernah berlaku untuk pilihan dark eksplisit di HP** —
`lib/theme.ts:30` keluar lebih awal, sementara web justru menjadikan midnight
pengganti dark.

**12. Nav berbeda dari web** — lihat §7. Ini keputusan produk, bukan bug.

---

## 11. Utang & kontradiksi terdaftar

Hal-hal yang benar tapi tidak enak, dicatat supaya tidak ditemukan ulang.

1. **`/listen` yatim di web.** Dashboard listener tidak punya satu pun tautan
   masuk — tidak dari `NAV_ITEMS`, tidak dari `QUICK_LINKS`, tidak dari halaman
   mana pun. `activeKeyFor()` pun tidak punya cabang untuknya (jatuh ke
   `beranda`). Di mobile ia tab kelas satu. Praktisnya, **fitur listener di web
   hanya bisa dicapai lewat mengetik URL.**
2. **Quiet hours tidak punya UI di kedua platform.** `quietHoursEnabled/Start/End`
   ada di interface TypeScript setelan web tapi tidak pernah dirender; fiturnya
   berjalan sepenuhnya di server dari `notification.quiet_hours_start/end`
   (22:00–07:00). User tidak bisa mengubahnya.
3. **Halaman legal masih placeholder** — padahal langkah konsen di onboarding
   menautkannya sebagai hal yang sedang disetujui.
4. **`apps/admin` masih memakai palet amber/navy pra-E18.** `globals.css`-nya
   punya `--color-accent: #8a4a00`, tanpa `--color-primary`, tanpa `--color-brand`,
   tanpa tint, dan **tanpa test kontras**. Komentar headernya mengklaim
   `lib/contrast.test.ts` menggagalkan build — file itu tidak ada di app admin.
5. **`packages/ui` direktori kosong.** Tidak ada paket komponen bersama; web dan
   mobile menduplikasi kode komponen dan hanya berbagi `@curhat/types`.
6. **Drift `FONT_STACK`**: `tokens.ts:215` menulis `'Segoe UI'`, `globals.css:33`
   menulis `'Segoe UI Rounded'`. Tidak ada test yang menangkap.
7. **Tiga aturan presedensi Midnight yang berbeda** — `theme-script.tsx` (memberi
   midnight walau OS terang), `themeForHour()` (mengembalikan `light` pada kasus
   yang sama), dan `mobile/lib/theme.ts` (keluar lebih awal untuk dark eksplisit).
   Tidak ada test yang membandingkan ketiganya.
8. **Tiga versi sapaan siang**: `vocabulary.ts` "Hai. Apa kabar hari ini?", lalu
   `web/lib/midnight.ts` dan `mobile/lib/theme.ts` sama-sama mendefinisikan "Ada
   yang mau diceritain hari ini?". Sapaan midnight identik di ketiganya.
9. **E18 tidak punya file task sama sekali.** Peta epic berhenti di E17. Seluruh
   rebrand rose — 28 commit, palet baru, rail desktop, penghapusan strip mood —
   hanya tercatat sebagai prosa di SUMMARY.md, **tanpa acceptance criteria**.
10. **`E15-T01-design-system.md` berstatus `done` dengan Scope yang basi**: masih
    menyebut "base dark navy/charcoal, aksen warm amber/peach" — arah yang tidak
    pernah dibangun dan sudah digantikan dua kali.

---

## Lampiran — selisih dengan `3-DESIGN-REFERENCE.md`

`3-DESIGN-REFERENCE.md` **tetap berlaku** sebagai spec. §0 (design direction,
token, a11y) sudah dikunci ulang ke rose di E18-T01 dan **cocok dengan kode** —
jangan dibongkar ulang, rujuk saja. Yang berbeda:

| § | Isi dokumen itu | Kenyataan |
|---|---|---|
| §1 | Bottom nav `HOME \| EXPLORE \| [+CURHAT] \| LISTEN \| PROFILE` | Benar untuk **mobile**; web memakai set lain (§7) |
| §1 | Rail desktop 5 tujuan | Rail terbangun memuat **8** |
| §2.2 | Auth = OTP + Google | Ada langkah **wajib buat password** (TECH-SPEC §5.4) |
| §2.4 | Beranda = tab + feed + FAB | Ada sapaan personal, kartu maskot, rak "Fitur Utama"; **strip mood dihapus** |
| §2.6 | `/create` | Rutenya `/curhat/baru` |
| §2.19 | `/moderation/appeal/:actionId` | Tidak pernah dibangun |
| §3 | 14 halaman admin | Satu halaman scaffold; nav 13 entri menuju rute tak ada |
| §5 | 20 komponen bersama | Web punya lebih; **mobile hanya 2 berkas** |
| §0 | Lavender = "DONG AI dan aksi sistem" | Ada pembalikan yang tidak tercatat: apa pun yang menuju **manusia** tetap rose, dan balon lawan bicara **tidak boleh** lavender (§2.4) |

---

*Ditulis 15 Agustus 2026. Kalau dokumen ini bertentangan dengan kode, kodenya
yang benar — perbaiki dokumen ini, jangan kodenya.*
