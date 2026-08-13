# Alokasi Port — CURHAT DONG

> VPS ini **dipakai bersama proyek lain**. Semua port CURHAT DONG sengaja
> dipindah ke blok sendiri supaya tidak pernah bentrok.
> Terakhir disurvei: 12 Agustus 2026.

## Blok CURHAT DONG

| Service | Port | Binding | Catatan |
|---|---|---|---|
| Web (Next.js) | `3100` | semua interface (dev) | **bukan** 3000 — sudah dipakai proyek lain |
| API (NestJS) | `3101` | semua interface (dev) | |
| Admin (Next.js) | `3102` | semua interface (dev) | |
| PostgreSQL | `54329` | `127.0.0.1` saja | **bukan** 5432 |
| Redis | `63799` | `127.0.0.1` saja | **bukan** 6379 — sudah dipakai Redis sistem |

Postgres dan Redis di-bind ke loopback saja (TECH-SPEC §7.1) — tidak pernah
bisa dijangkau dari jaringan luar, bahkan saat development.

## Port yang SUDAH dipakai di VPS ini — jangan disentuh

| Port | Pemakai |
|---|---|
| `22` | SSH |
| `53` | systemd-resolved |
| `80`, `443` | web server (reverse proxy) |
| `3000` | `next-server` — proyek lain |
| `3020` | `/var/www/POH/backend` |
| `3021` | `/var/www/POH/frontend` (Vite) |
| `6379` | `redis-server` sistem — dipakai proyek lain |
| `40551`, `43771`, `46453` | tooling editor (ephemeral) |

## Kenapa Redis tidak menumpang instance yang sudah ada

Redis sistem di `6379` sudah dipakai proyek lain. Menumpang di situ dengan
nomor DB berbeda **memang bisa**, tapi tidak dilakukan karena:

- satu `FLUSHALL` dari proyek mana pun menghapus data proyek lainnya;
- BullMQ memakai key global dan pola `KEYS`/`SCAN` yang bisa saling terlihat;
- rate limit dan listener availability CURHAT DONG akan bercampur dengan
  keyspace yang tidak kita kendalikan.

Instance sendiri di `63799` jauh lebih murah daripada menelusuri kenapa
antrian job hilang.

## Cek sebelum menyalakan infra

```bash
pnpm infra:check
```

Skrip ini menolak menyalakan container kalau ada port yang sudah terpakai —
lebih baik gagal dengan pesan jelas daripada menabrak layanan proyek lain.

## Produksi (E17) — VPS bersama

VPS `139.180.223.100` menjalankan **empat proyek lain** di `/var/www/`
(POH, selsila-web, selsipad, selsipad-docs), dan **nginx sudah memegang port
80/443** untuk mereka.

Karena itu stack produksi CURHAT DONG **tidak pernah mem-bind port publik**.
Semua container bind ke loopback dan nginx yang mem-proxy:

| Service | Host (loopback) | Container |
|---|---|---|
| web | `127.0.0.1:3110` | 3000 |
| api | `127.0.0.1:3111` | 3001 |
| admin | `127.0.0.1:3112` | 3002 |
| uptime-kuma | `127.0.0.1:3103` | 3001 |
| dozzle | `127.0.0.1:3104` | 8080 |
| postgres | — (tanpa port) | 5432 |
| redis | — (tanpa port) | 6379 |

Caddy **sengaja dihapus** dari compose produksi. Di mesin bersama, edge proxy
adalah sumber daya tunggal: dua proxy berebut 443 tidak punya solusi bagus,
yang ada cuma siapa yang menang — dan yang kalah adalah empat proyek orang lain.
