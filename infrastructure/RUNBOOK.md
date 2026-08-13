# RUNBOOK — Operasi CURHAT DONG

Ditulis untuk dijalankan **di bawah tekanan, oleh orang yang tidak menulisnya**.
Setiap langkah menyebut apa yang seharusnya terlihat kalau berhasil — supaya
"perintahnya jalan" tidak tertukar dengan "hasilnya benar".

VPS: `139.180.223.100` · repo kerja: `/home/selsipad/curhat-dong`

> **Docker butuh `sudo` di mesin ini.** User `selsipad` belum masuk grup
> `docker`. Semua perintah `docker` di bawah ditulis dengan `sudo`.

Singkatan yang dipakai berulang:

```bash
cd /home/selsipad/curhat-dong/infrastructure
```

```bash
sudo docker compose -f docker-compose.prod.yml ps
```

---

## 1. Uptime Kuma — E17-T06

Container-nya **sudah jalan** (`127.0.0.1:3103`), tapi belum pernah dikonfigurasi:
belum ada akun, belum ada monitor, belum ada notifikasi. Task ini baru boleh
disebut selesai setelah **alarmnya pernah berbunyi sungguhan** (langkah 1.6).

Dashboard sengaja tidak menghadap internet — daftar endpoint kamu berikut
jam-jam lemahnya bukan sesuatu yang dipublikasikan demi kenyamanan.

### 1.1 Buka dashboard lewat SSH tunnel

Dari **laptop kamu**, bukan dari VPS:

```bash
ssh -L 3103:127.0.0.1:3103 selsipad@139.180.223.100
```

Biarkan terminal itu terbuka, lalu buka `http://127.0.0.1:3103` di browser laptop.

Kalau muncul halaman setup → benar. Kalau `connection refused`, cek dulu
container-nya hidup:

```bash
sudo docker compose -f docker-compose.prod.yml ps uptime-kuma
```

### 1.2 Buat akun admin

Halaman pertama minta username + password. Ini **cuma muncul sekali seumur
instalasi** — tidak ada "lupa password" yang gampang di Uptime Kuma.

Simpan di password manager. Jangan di repo ini.

### 1.3 Buat bot Telegram

Butuh dua nilai: **bot token** dan **chat id**.

**Token** — di Telegram, chat dengan [@BotFather](https://t.me/BotFather):

```
/newbot
```

Ikuti promptnya (nama bebas, username harus diakhiri `bot`, mis.
`curhatdong_ops_bot`). BotFather membalas token berbentuk
`8123456789:AAF...`. Itu tokennya.

**Chat id** — bikin grup Telegram (mis. "CURHAT DONG ops"), **masukkan bot yang
barusan dibuat ke grup itu**, lalu kirim satu pesan apa saja ke grup. Setelah
itu, dari mana saja:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*' | head -1
```

Angkanya biasanya **negatif** untuk grup (mis. `-1001234567890`) — itu normal,
ikutkan tanda minusnya.

Kalau `getUpdates` balikannya kosong: botnya belum pernah menerima pesan.
Kirim pesan lagi ke grup, lalu ulangi.

> **Pakai grup, bukan chat pribadi.** Alert yang cuma masuk ke satu HP berhenti
> jadi alert begitu orangnya tidur, sakit, atau ganti nomor.

### 1.4 Pasang notifikasi di Uptime Kuma

**Profile (kanan atas) → Settings → Notifications → Setup Notification**

| Field | Isi |
|---|---|
| Notification Type | Telegram |
| Friendly Name | `Telegram ops` |
| Bot Token | token dari 1.3 |
| Chat ID | chat id dari 1.3 |
| Default enabled | ✅ centang |
| Apply on all existing monitors | ✅ centang |

Tekan **Test** dan pastikan pesannya benar-benar sampai di grup **sebelum**
Save. Tombol Test ada persis untuk ini.

Isi alert tidak boleh memuat data user — host, nama monitor, status, durasi.
Tidak pernah body request, tidak pernah path berisi id (non-negotiable #3).
Uptime Kuma default-nya memang begitu; yang perlu dijaga adalah jangan menaruh
id di **nama monitor**.

### 1.5 Tambah lima monitor

**+ Add New Monitor** untuk masing-masing. Yang tidak disebut, biarkan default.

| Friendly Name | Monitor Type | URL / Host | Heartbeat Interval | Retries |
|---|---|---|---|---|
| `API ready` | HTTP(s) | `https://api.curhatdong.com/v1/health/ready` | `60` | `2` |
| `API live` | HTTP(s) | `https://api.curhatdong.com/v1/health/live` | `60` | `3` |
| `Web` | HTTP(s) | `https://curhatdong.com/` | `120` | `3` |
| `Admin` | HTTP(s) | `https://admin.curhatdong.com/` | `300` | `3` |
| `Cert expiry` | HTTP(s) | `https://api.curhatdong.com/v1/health/live` | `3600` | `3` |

Untuk **Cert expiry**: nyalakan *Certificate Expiry Notification* di monitor itu
(Uptime Kuma memperingatkan pada H-21 dan H-14). Ini bukan monitor terpisah
sungguhan — dia menumpang koneksi TLS monitor lain. Satu host cukup: keempat
domain diterbitkan dari satu proses certbot yang sama.

**Kenapa retry-nya beda-beda.** Dua retry di interval 60 detik berarti alert
berbunyi setelah ±3 menit gagal beneran. Monitor ber-retry satu akan
membangunkan orang untuk satu paket yang hilang — dan setelah tiga kali begitu,
alertnya berhenti dibaca. Itu mode kegagalan monitoring yang sesungguhnya, bukan
outage yang kelewat.

**`ready` yang membangunkan, `live` yang menjelaskan.** `ready` gagal sementara
`live` lolos artinya API hidup tapi tidak bisa menjangkau database — malam yang
sama sekali berbeda dari prosesnya mati, dan penanganannya juga beda.

### 1.6 Buktikan alarmnya berbunyi

Ini langkah yang bikin task-nya selesai. Monitoring yang belum pernah berbunyi
adalah monitoring yang belum diuji — dan lebih buruk daripada tidak ada, karena
menciptakan keyakinan bahwa seseorang akan diberi tahu.

```bash
sudo docker compose -f docker-compose.prod.yml stop api
```

Tunggu maksimal 5 menit. Yang harus terjadi: `API ready` dan `API live` merah,
dan **pesan Telegram masuk ke grup**. Lalu:

```bash
sudo docker compose -f docker-compose.prod.yml start api
```

Pesan recovery harus menyusul. Catat jam berapa alert turun dan berapa lama —
angka itu yang menentukan ekspektasi respons malam hari.

> Lakukan di jam sepi. Selama `api` mati, aplikasinya beneran mati untuk semua
> orang — dan sejak deploy pertama, "semua orang" bukan lagi cuma kita.

---

## 2. Drill restore — E17-T07

### Kondisi sekarang: backup belum pernah jalan

Sebelum apa pun, ini apa adanya:

| Yang dibutuhkan | Status |
|---|---|
| `infrastructure/scripts/backup.sh` | ✅ ada dan terbaca |
| `infrastructure/scripts/restore.sh` | ✅ ada dan terbaca |
| `age` (enkripsi) | ❌ belum terpasang di VPS |
| `aws` CLI (upload) | ❌ belum terpasang di VPS |
| `BACKUP_AGE_RECIPIENT` | ❌ kosong |
| `BACKUP_BUCKET` | ❌ kosong |
| cron harian | ❌ belum ada |
| File backup yang pernah dibuat | ❌ nol — `infrastructure/backups/` kosong |

Artinya **restore drill penuh belum bisa dijalankan**: tidak ada yang bisa
di-restore. Tapi angka RTO tidak perlu menunggu itu, dan bagian yang paling
mungkin gagal — dump dan restore Postgres-nya sendiri — bisa dibuktikan hari
ini. Makanya drill-nya dua tahap.

---

### Drill A — restore lokal (bisa dijalankan sekarang, ~15 menit)

Membuktikan tiga hal sekaligus: dump-nya utuh, restore-nya jalan, dan datanya
sama. Tidak menyentuh database produksi, tidak butuh bucket.

**A1. Ambil dump dari database yang sedang hidup**

```bash
cd /home/selsipad/curhat-dong/infrastructure && sudo docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U curhat -d curhat_dong --no-owner --clean --if-exists > /tmp/drill.sql
```

Cek ukurannya masuk akal — dump yang gagal di tengah sering tetap exit 0:

```bash
ls -lh /tmp/drill.sql && head -3 /tmp/drill.sql
```

Baris awalnya harus berupa komentar `-- PostgreSQL database dump`. Kalau
filenya di bawah ~10 KB, dump-nya gagal; jangan lanjut.

**A2. Catat kebenaran yang akan dibandingkan nanti**

```bash
sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U curhat -d curhat_dong -c "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'curhat_posts', count(*) FROM curhat_posts UNION ALL SELECT 'categories', count(*) FROM categories UNION ALL SELECT 'app_configs', count(*) FROM app_configs ORDER BY 1;"
```

Simpan hasilnya (screenshot atau salin ke catatan). Tanpa angka pembanding,
restore yang menghasilkan database kosong tetap terlihat "berhasil".

**A3. Buat database tujuan yang terpisah**

Namanya **bukan** `curhat_dong`. Drill tidak boleh berjarak satu salah ketik
dari menimpa produksi.

```bash
sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U curhat -d postgres -c "DROP DATABASE IF EXISTS curhat_dong_restore;" -c "CREATE DATABASE curhat_dong_restore TEMPLATE template0 ENCODING 'UTF8';"
```

**A4. Restore, sambil dihitung waktunya**

Angka inilah yang jadi dasar RTO:

```bash
time (sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U curhat -d curhat_dong_restore -q < /tmp/drill.sql > /tmp/drill-restore.log 2>&1)
```

Catat `real` dari output `time`.

**A5. Bandingkan — ini bagian yang membuatnya drill, bukan sekadar perintah**

```bash
sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U curhat -d curhat_dong_restore -c "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'curhat_posts', count(*) FROM curhat_posts UNION ALL SELECT 'categories', count(*) FROM categories UNION ALL SELECT 'app_configs', count(*) FROM app_configs ORDER BY 1;"
```

Angkanya harus sama dengan A2 (`categories` 15, `app_configs` 63 kalau belum
ada perubahan). Cek juga error yang tertelan:

```bash
grep -i "^ERROR" /tmp/drill-restore.log | head -20
```

Beberapa `ERROR: ... does not exist, skipping` dari `--clean --if-exists` itu
normal di database kosong. Yang **tidak** normal: `syntax error`, `permission
denied`, atau error pada `CREATE TABLE`/`COPY`.

**A6. Bersihkan**

```bash
sudo docker compose -f docker-compose.prod.yml exec -T postgres psql -U curhat -d postgres -c "DROP DATABASE curhat_dong_restore;" && shred -u /tmp/drill.sql 2>/dev/null || rm -f /tmp/drill.sql
```

Dump itu berisi seluruh curhat orang dalam bentuk polos. Dia tidak boleh
menginap di `/tmp`.

**A7. Catat hasilnya** di bagian [3. Catatan RTO](#3-catatan-rto) di bawah.

---

### Drill B — restore penuh dari off-site (setelah pipeline backup ada)

Drill A membuktikan Postgres-nya. Yang belum dibuktikan Drill A: enkripsi,
upload, dan bahwa file di bucket benar-benar bisa dibuka lagi — **justru bagian
yang paling sering ternyata rusak baru pada saat dibutuhkan.**

**B1. Pasang dua tool yang kurang** (butuh sudo password kamu)

```bash
sudo apt-get update && sudo apt-get install -y age awscli
```

**B2. Buat kunci age**

```bash
age-keygen -o ~/curhat-backup-key.txt
```

Outputnya menampilkan baris `Public key: age1...`.

- **Public key** (`age1...`) → masuk ke `BACKUP_AGE_RECIPIENT`. Ini yang dipakai
  **mengenkripsi**, aman ada di server.
- **File `~/curhat-backup-key.txt`** berisi private key → **pindahkan keluar
  dari VPS** ke password manager tim, lalu hapus dari VPS.

Kenapa dipisah: backup terenkripsi dengan kunci yang disimpan di sebelahnya itu
penyamaran, bukan enkripsi. Siapa pun yang mendapat bucket-nya juga mendapat
kuncinya.

> Konsekuensinya jujur: **kehilangan private key = kehilangan semua backup**,
> tanpa jalan pulang. Simpan di dua tempat berbeda sekarang, bukan nanti.

**B3. Kredensial S3** — sudah ada di `.env.production` (`S3_ACCESS_KEY` /
`S3_SECRET_KEY`, bucket `curhat-storage` di `sgp1.vultrobjects.com`).

```bash
aws configure
```

Isi access key & secret dari situ, region `sgp1`, output `json`.

Bikin bucket terpisah untuk backup (**jangan** satu bucket dengan storage
aplikasi — kompromi di satu sisi seharusnya tidak otomatis membawa yang lain):

```bash
aws s3 mb s3://curhat-backup --endpoint-url https://sgp1.vultrobjects.com
```

**B4. Isi `.env.production`**

```
BACKUP_AGE_RECIPIENT=age1...      # public key dari B2
BACKUP_BUCKET=curhat-backup
```

**B5. Jalankan backup sekali secara manual**

```bash
cd /home/selsipad/curhat-dong/infrastructure && set -a && . ./.env.production && set +a && ./scripts/backup.sh
```

Harus mencetak 4 langkah dan diakhiri `selesai: curhat-<stamp>.sql.age`.

**B6. Restore file itu balik** — inilah drill yang sebenarnya:

```bash
cd /home/selsipad/curhat-dong/infrastructure && set -a && . ./.env.production && set +a && BACKUP_AGE_KEY_FILE=/path/ke/kunci-privat ./scripts/restore.sh curhat-<stamp>.sql.age
```

Tanpa argumen kedua, tujuannya otomatis `curhat_dong_restore` — bukan produksi.
Skripnya mencetak durasi di akhir. Bandingkan lagi jumlah barisnya seperti A5.

**B7. Pasang cron harian** (03.00 WIB = 20.00 UTC, jam paling sepi):

```bash
( crontab -l 2>/dev/null; echo '0 20 * * * cd /home/selsipad/curhat-dong/infrastructure && set -a && . ./.env.production && set +a && ./scripts/backup.sh >> /var/log/curhat-backup.log 2>&1' ) | crontab -
```

Lalu **tambahkan monitor untuk backup itu sendiri**. Backup yang diam-diam
berhenti jalan terlihat persis seperti backup yang baik-baik saja — sampai hari
kamu membutuhkannya. Cara termurah: Uptime Kuma → Add New Monitor → tipe **Push**,
lalu tempel URL push-nya di akhir perintah cron. Kalau backup tidak berjalan,
push tidak terjadi, dan monitornya merah.

---

## 3. Catatan RTO

Diisi setiap kali drill dijalankan. Kolom "ukuran" penting: durasi restore naik
seiring data, jadi angka dari database kecil akan menyesatkan setahun lagi.

| Tanggal | Drill | Ukuran dump | Durasi restore | Catatan |
|---|---|---|---|---|
| _(belum pernah)_ | | | | |

**RTO = durasi restore + waktu menyadari + waktu mengambil keputusan.** Yang
diukur drill cuma suku pertama. Dua sisanya ditentukan langkah 1.6 (seberapa
cepat alarm berbunyi) dan oleh siapa yang berwenang memutuskan restore.

---

## 4. Perintah yang sering dipakai

```bash
cd /home/selsipad/curhat-dong/infrastructure && sudo docker compose -f docker-compose.prod.yml ps
```

> **Selama GHCR masih kosong, setiap perintah yang menyalakan container wajib
> ikut `-f docker-compose.build.yml`.** `docker-compose.prod.yml` sendirian
> menunjuk ke `ghcr.io/bagust1985/curhat-dong/*`, dan CI belum pernah jalan —
> jadi `up` tanpa override akan gagal menarik image dan **mematikan container
> yang tadinya sehat**. Perintah baca saja (`ps`, `logs`) aman tanpa override.
>
> Begitu pipeline Images sukses sekali, override ini dibuang dan `IMAGE_TAG`
> berisi SHA, bukan `local`.

```bash
cd /home/selsipad/curhat-dong/infrastructure && sudo docker compose -f docker-compose.prod.yml logs -f --tail=100 api
```

```bash
curl -s https://api.curhatdong.com/v1/health/ready
```

Restart API + worker setelah mengubah `.env.production` (perhatikan override
`build.yml` — lihat catatan di atas):

```bash
cd /home/selsipad/curhat-dong/infrastructure && sudo docker compose -f docker-compose.prod.yml -f docker-compose.build.yml up -d --force-recreate api worker
```

`--force-recreate` tanpa `--build`: env-nya berubah, kodenya tidak. Container
dibuat ulang dari image yang sudah ada, tidak ada build yang jalan.

Log container juga bisa dibaca lewat Dozzle di `127.0.0.1:3104` (tunnel yang
sama seperti 1.1).
