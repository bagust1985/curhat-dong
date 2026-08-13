# Template Pemberitahuan Insiden

**E17-T09.** Draft. **⚠️ Harus direview penasihat hukum sebelum dikirim** — isi
di bawah ini disiapkan supaya tidak ada yang menulis dari nol dalam 72 jam,
bukan supaya bisa dikirim tanpa dibaca.

Placeholder `[…]` wajib diisi. Kalau ada yang belum diketahui, tulis apa adanya
bahwa belum diketahui — jangan dikira-kira.

---

## 1. Ke subjek data terdampak (email)

> **Subjek:** Pemberitahuan penting soal keamanan akun CURHAT DONG
>
> Halo,
>
> Kami perlu memberi tahu kamu sesuatu yang tidak enak, dan kami ingin kamu
> dengar langsung dari kami.
>
> Pada [tanggal], kami menemukan bahwa [penjelasan singkat, tanpa jargon].
> Kejadiannya berlangsung sejak sekitar [tanggal mulai] sampai kami hentikan
> pada [tanggal ditahan].
>
> **Data yang mungkin terdampak:** [kategori — mis. "nama samaran dan isi
> curhat kamu"]. [Kalau ada yang pasti TIDAK terdampak, sebutkan.]
>
> **Yang sudah kami lakukan:** [langkah, konkret]. [Kalau ada yang masih
> berjalan, katakan.]
>
> **Yang bisa kamu lakukan:** [langkah nyata, mis. keluar dari semua perangkat
> di Pengaturan]. Kalau kamu tidak perlu melakukan apa-apa, katakan begitu —
> jangan buat orang merasa harus bertindak tanpa alasan.
>
> Kami tahu tempat ini kamu pakai buat cerita hal-hal yang tidak kamu ceritakan
> ke banyak orang. Kejadian ini mengkhianati itu, dan kami minta maaf.
>
> Kalau ada yang mau ditanyakan: [kontak].
>
> — Tim CURHAT DONG

**Yang dilarang di surat ini:** mengutip isi curhat siapa pun (itu kebocoran
kedua), mengecilkan sebelum angkanya diketahui, dan menyalahkan pihak ketiga
tanpa menyebut bahwa kami yang memilih pihak ketiga itu.

---

## 2. Ke otoritas

> **Perihal:** Pemberitahuan insiden pelindungan data pribadi
>
> 1. **Penyelenggara:** [badan hukum], PSE [nomor pendaftaran]
> 2. **Waktu kejadian:** [mulai] – [ditahan]
> 3. **Waktu disadari:** [tanggal & jam] — dasar penghitungan 3×24 jam
> 4. **Kronologi:** [ringkas, faktual]
> 5. **Kategori data pribadi terdampak:** [dari `DATA_CATEGORIES`]
> 6. **Perkiraan jumlah subjek data:** [angka] ([metode: hasil
>    `scopeFromAudit` atas audit log periode tersebut])
> 7. **Dampak yang mungkin timbul:** [jujur]
> 8. **Penanganan:** [containment, perbaikan, pencegahan]
> 9. **Pemberitahuan ke subjek data:** [tanggal, kanal, jumlah terkirim]
> 10. **Kontak PIC:** [nama, jabatan, telepon, email]

⚠️ **Format, kanal, dan lembaga tujuan wajib diverifikasi ke sumber resmi
terkini.** Nama kementerian dan alur pelaporan pernah berubah; struktur di atas
adalah kerangka isi, bukan formulir resmi.

---

## 3. Catatan internal (bukan untuk dikirim)

Diisi saat insiden berjalan, dipakai untuk post-mortem:

```
Jam disadari      :
Jam ditahan       :
Jendela audit     : [mulai] – [ditahan]  (dipakai scopeFromAudit)
User terdampak    : [jumlah]
Kategori data     :
Aksi tak dikenali : [dari hasil scope — kalau ada, jangan diabaikan]
Batas 72 jam      : [notificationDeadline()]
```
