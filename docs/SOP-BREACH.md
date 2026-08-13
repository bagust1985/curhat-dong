# SOP Insiden Kebocoran Data

**Task:** E17-T09 · **Acuan:** UU PDP, PRD §25.6 · **Status:** draft operasional —
lihat "Yang masih kosong" di bawah.

---

## Kenapa dokumen ini ada sebelum ada insiden

UU PDP memberi **3×24 jam** untuk memberitahu secara tertulis. Di dalam jendela
itu tidak ada orang yang akan menulis query ke skema yang baru dia lihat, jam 2
pagi, sambil menahan insidennya. Tiga hal harus sudah ada **sebelum** ditanya:

1. **Siapa PIC-nya** — nama, bukan jabatan.
2. **Template pemberitahuan** — sudah ditulis, tinggal diisi.
3. **Kemampuan menjawab "siapa yang terdampak"** — kode, bukan niat.

Nomor 3 sudah ada dan teruji: `apps/api/src/worker/breach-scope.ts`.

---

## Jam pertama: tahan dulu

Urutannya sengaja bukan "cari tahu dulu". Menahan lebih dulu memperkecil
lingkupnya; menyelidiki lebih dulu memperbesarnya.

1. **Cabut akses yang dicurigai.**
   - Admin: nonaktifkan akun, paksa MFA ulang.
   - Token user: `POST /v1/auth/logout-all` untuk akun terdampak, atau cabut
     seluruh family kalau ini kebocoran token.
   - Pihak ketiga: putar kunci API-nya sekarang, jangan setelah rapat.
2. **Jangan hapus apa pun.** Log adalah satu-satunya cara mengukur lingkup.
   Menghapus jejak untuk "membersihkan" berarti tidak akan pernah bisa
   memberitahu siapa yang terdampak — dan itu pelanggaran terpisah.
3. **Catat jamnya.** Kapan diduga mulai, kapan disadari, kapan ditahan.
   **Jam "disadari" yang memulai hitungan 72 jam**, bukan jam kejadian.

---

## Jam 1–24: tentukan lingkupnya

```bash
# Jendela diambil dari dugaan awal kompromi, bukan dari saat ketahuan —
# selisih keduanya biasanya justru tempat kerusakannya.
psql "$DATABASE_URL" -c "
  SELECT actor_id, action, target_type, target_id, case_id, created_at
  FROM audit_logs
  WHERE created_at BETWEEN '<mulai>' AND '<ditahan>'
    AND (actor_id = '<admin_terkompromi>' OR '<kosongkan untuk semua>' = '')
  ORDER BY created_at
" --csv > /tmp/trail.csv
```

Lalu jalankan hasilnya lewat `scopeFromAudit()` (`breach-scope.ts`). Yang
keluar: daftar user id terdampak, **kategori** data, dan peringkat aksi untuk
post-mortem.

Dua hal yang sengaja:

- Fungsi itu mengembalikan **id dan kategori, bukan isinya**. Respons insiden
  yang dimulai dengan menumpahkan curhat terdampak ke file kerja sudah
  memperlebar kebocoran sambil mengukurnya.
- Aksi yang **tidak dikenali dilaporkan**, bukan dianggap tidak berbahaya. Aksi
  audit baru yang belum dipetakan akan terhitung "tidak menyentuh apa pun" dan
  membuat pemberitahuan meremehkan kejadiannya.

**Target: lingkup selesai < 24 jam.** Sisanya buat menulis, mereview, dan
mengirim.

---

## Jam 24–72: beritahu

Dua penerima, dua template ([templates.md](SOP-BREACH-TEMPLATES.md)):

| Penerima | Isi | Catatan |
|---|---|---|
| Otoritas (Kementerian/lembaga sesuai UU PDP) | Kronologi, kategori data, jumlah subjek, langkah penanganan | ⚠️ Format resmi wajib diverifikasi ke sumber terkini |
| Subjek data terdampak | Apa yang terjadi, data apa, apa yang sudah kami lakukan, apa yang bisa dia lakukan | Bahasa Indonesia biasa, tanpa pasal |

Aturan isi pemberitahuan ke user:

- **Jangan mengecilkan.** "Kemungkinan sebagian kecil data" ketika angkanya
  belum diketahui adalah klaim yang belum tentu benar.
- **Jangan sertakan datanya.** Surat yang mengutip isi curhat orang untuk
  membuktikan kebocoran adalah kebocoran kedua.
- **Sebutkan yang belum diketahui.** "Kami belum bisa memastikan X" lebih baik
  daripada diam yang nanti terbaca sebagai menyembunyikan.

---

## Setelah: post-mortem

Dalam 7 hari, tertulis, tanpa nama orang sebagai penyebab:

1. Kronologi jam per jam.
2. Bagaimana bisa terjadi — kontrol mana yang tidak ada, atau ada tapi tidak
   berbunyi.
3. Bagaimana ketahuannya, dan berapa lama. Kalau yang menemukan bukan monitoring
   kita, itu temuan tersendiri.
4. Perbaikan, masing-masing jadi task di `.agents/tasks/`, dengan pemilik dan
   tanggal.

---

## Table-top exercise (verifikasi task ini)

Sekali sebelum go-live, lalu tiap 6 bulan. Skenario: *satu akun admin
terkompromi selama 3 hari, ketahuan hari keempat.*

Yang diukur cuma satu hal: **berapa lama sampai daftar user terdampak keluar.**
Kalau lebih dari 24 jam, yang perlu diperbaiki bukan orangnya — query atau
aksesnya.

---

## Yang masih kosong — harus diisi manusia

| Hal | Kenapa tidak bisa ditulis di sini |
|---|---|
| **PIC on-call (nama + nomor)** | Harus orang yang benar-benar setuju dipanggil jam 3 pagi |
| **Cadangan PIC** | Satu nama bukan rotasi |
| **Kontak penasihat hukum** | Pemberitahuan ke otoritas sebaiknya lewat dia |
| **Format & kanal resmi pelaporan** | Prosedur dan nama lembaga pernah berubah; wajib diverifikasi ke sumber resmi terkini, bukan ke dokumen ini |
| **Tanggal table-top pertama** | Latihan yang tidak dijadwalkan tidak terjadi |
