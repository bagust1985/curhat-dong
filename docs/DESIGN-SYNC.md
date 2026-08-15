# Menyambungkan design system ke Claude Design

> Cara mendorong komponen CURHAT DONG ke proyek design system di
> [claude.ai/design](https://claude.ai/design), dan cara menjaganya tetap sinkron
> tanpa saling menimpa.
>
> Terakhir dijalankan: **15 Agustus 2026** — 14 kartu terunggah dan terdaftar.

---

## Keadaan sekarang

| | |
|---|---|
| Proyek | **"Design System"** — `1bf9d9f3-b4d7-4f8f-bf82-e7341ace9cc5` |
| Tipe | `PROJECT_TYPE_DESIGN_SYSTEM` ✅ |
| Isi | 14 kartu + `README.md` |
| Sumber | `docs/design-sync/gen-bundle.py` |

> ID proyek di atas adalah **pengenal, bukan kredensial** — tanpa login akunmu ia
> tidak memberi akses apa pun. Dicatat di sini supaya sesi berikutnya tidak perlu
> menebak proyek mana yang benar.

Kartu yang sudah ada:

| Grup | Kartu |
|---|---|
| Foundations | Warna · Tipografi · Bentuk & spacing |
| Actions | Tombol & wordmark · Badge & input |
| Feed | CurhatCard · ReactionBar · Mood & Intent |
| Conversation | ChatBubble · CommentItem · ListenerCard · EmptyState |
| Navigation | Bar HP + rail desktop |
| Safety | Felt Heard & konfirmasi destruktif |

---

## 1. Konsep: apa yang sebenarnya dimakan Claude Design

Proyek Claude Design **bukan tempat menyimpan dokumen.** Dia galeri kartu: tiap
kartu adalah satu berkas **HTML yang dirender** jadi preview visual di panel
Design System.

Konsekuensinya:

- **Markdown tidak bisa jadi kartu.** `.agents/4-DESIGN-SYSTEM.md` isinya lengkap,
  tapi tidak ada yang bisa dirender darinya. Dokumen itu untuk dibaca manusia dan
  agen; Claude Design untuk **dilihat**.
- **Tidak ada fitur "link repo".** Tidak ada tombol yang menghubungkan folder ke
  proyek. Sinkronisasinya adalah **dorongan dari berkas lokal ke proyek cloud**,
  dijalankan dari sesi Claude Code.

## 2. Anatomi satu berkas preview

Kuncinya ada di komentar **baris pertama**:

```html
<!-- @dsCard group="Feed" -->
<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>CurhatCard</title>
<style>/* seluruh CSS di sini, inline */</style>
</head><body>
  <article class="curhat">…</article>
</body></html>
```

Tiga aturan yang membuatnya jalan:

1. **`@dsCard` wajib di baris pertama.** Nilai `group` jadi nama seksi di panel.
   Kalau markernya turun satu baris, ia tidak terbaca.
2. **Harus mandiri penuh.** Dilarang `<link>` ke CSS luar, font CDN, atau gambar
   remote — kartu dirender terisolasi. Semua CSS di-inline dan font disematkan
   sebagai `data:` URI. Itu sebabnya tiap preview ±60 KB: Nunito ikut di dalamnya.
3. **Satu berkas = satu kartu.** Jangan gabungkan semua komponen jadi satu
   halaman panjang; panel mengindeks per berkas.

## 3. Alur unggah — lima langkah

Dijalankan lewat tool `DesignSync` dari sesi Claude Code:

| # | Metode | Gunanya |
|---|---|---|
| 1 | `list_projects` | Cari proyek yang bisa ditulisi |
| 2 | `get_project` | **Pastikan tipenya `PROJECT_TYPE_DESIGN_SYSTEM`** |
| 3 | `list_files` | Lihat isi sekarang — apa yang akan tertimpa |
| 4 | `finalize_plan` | **Kunci daftar path** yang boleh ditulis/dihapus → `planId` |
| 5 | `write_files` → `register_assets` | Unggah, lalu daftarkan kartunya |

**Langkah 4 adalah pagar keamanan, dan sengaja merepotkan.** Agen tidak bisa
menulis ke path yang tidak didaftarkan lebih dulu, dan kamu melihat daftar path
plus folder sumbernya sebelum menyetujui. `finalize_plan` menuntut `writes`
**dan** `deletes` — kirim `[]` kalau memang tidak ada yang dihapus.

⚠️ **Tipe proyek tidak bisa diubah setelah dibuat.** Kalau kamu membuat proyek
biasa lalu mendorong komponen ke sana, ia tidak akan pernah menjadi design system.
Karena itu langkah 2 tidak boleh dilewat.

## 4. Membangun ulang bundelnya

```bash
python3 docs/design-sync/gen-bundle.py
```

Hasilnya ke `.design-bundle/` (gitignored — bundel adalah artefak build,
**generatornya** yang jadi sumber). Skrip mencari font Nunito otomatis di keluaran
build Next.js, jadi jalankan `pnpm --filter @curhat/web build` atau `dev` minimal
sekali dulu. Tanpa font, bundel tetap jadi dan jatuh ke stack sistem membulat.

Kalau kamu mengubah hex di `apps/web/lib/tokens.ts`, ubah juga di generator lalu
bangun ulang. Sisi aplikasi dijaga `lib/css-tokens.test.ts`; sisi bundel ini
**tidak ada yang menjaga**, jadi ia bisa melenceng diam-diam.

## 5. ⚠️ Jebakan terpenting: editan di panel bisa tertimpa

Kalau kamu mengedit sebuah kartu langsung di panel Design System, lalu ada
dorongan berikutnya dengan path yang sama, **editanmu tertimpa tanpa peringatan.**
Tidak ada merge otomatis.

Cara menghindarinya — sebut saja saat meminta dorongan berikutnya:

> "aku udah ngedit chat-bubble di Claude Design, baca dulu sebelum push"

Agen akan `get_file` isi versi cloud, menggabungkannya, baru mendorong. Ini juga
alasan tool-nya didesain **inkremental**: satu komponen per dorongan, bukan ganti
massal. Setiap permintaan "dorong ulang semuanya" menaikkan risiko menimpa.

## 6. Alur kerja yang disarankan

1. Review kartu di panel, edit yang kurang pas
2. Sebutkan bagian mana yang kamu ubah
3. Agen membaca versi cloud, menerapkannya ke komponen React di repo, lalu
   mendorong balik yang perlu

Dengan begitu **Claude Design jadi tempat memutuskan, repo jadi tempat
menjalankan**, dan keduanya tidak saling menimpa.

## 7. Catatan

- Skill `/design-sync` **belum aktif** di akun ini. Tool `DesignSync` tetap jalan
  tanpanya; skill itu yang memegang disiplin inkremental secara otomatis. Karena
  bundel ini ditulis tangan (bukan hasil self-check aplikasi skill), kartunya
  didaftarkan eksplisit lewat `register_assets`.
- Nama proyek **tidak bisa diubah** lewat tool. Kalau "Design System" terasa
  terlalu generik, buat proyek baru bernama jelas lalu dorong ulang bundelnya —
  murah, karena generatornya ada di repo.
- Bundel ini hanya memuat **komponen web**. Mobile baru punya dua berkas komponen
  (`apps/mobile/components/`), dan tujuh komponen web belum ada padanannya di HP —
  lihat `.agents/4-DESIGN-SYSTEM.md` §10.

---

*Dokumen naratif design system: [`.agents/4-DESIGN-SYSTEM.md`](../.agents/4-DESIGN-SYSTEM.md)*
