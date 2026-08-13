---
id: E17-T01
epic: E17
title: Caddy — TLS, HSTS, security headers
status: in_progress
estimate: 1d
depends_on: [E01-T08]
refs: [TECH-SPEC §7.1, §9.1]
---

## Scope
Caddyfile untuk `curhatdong.com`, `api.curhatdong.com`, `admin.curhatdong.com`.

## Acceptance criteria
- TLS otomatis, HSTS, redirect HTTP→HTTPS, security headers.
- **PostgreSQL & Redis tidak terekspos ke internet publik** (TECH-SPEC §7.1).
- CSP disetel untuk web & admin.

## Verifikasi
Scan SSL Labs + cek header; coba akses port DB dari luar → harus tertutup.

## Catatan implementasi

- `infrastructure/Caddyfile` untuk tiga domain. TLS otomatis; yang ditulis di
  situ justru yang **tidak** otomatis: HSTS 2 tahun + preload, security header,
  dan CSP terpisah untuk web (Turnstile + Google saja) dan admin (lebih ketat,
  `no-store`).
- **Postgres & Redis tidak muncul sama sekali di file ini** — bukan diblokir,
  memang tidak ada rute ke sana. Itu satu-satunya versi yang tidak bisa
  dibatalkan oleh satu edit firewall.
- **Belum diverifikasi**: SSL Labs, cek header dari luar, dan uji port DB
  tertutup — butuh VPS dan domain yang sudah mengarah.


## Revisi (VPS bersama) — Caddy dibatalkan

Setelah melihat VPS-nya: **nginx sudah aktif memegang port 80/443** untuk empat
proyek lain di `/var/www/`. Compose yang mem-bind `80:80`/`443:443` akan gagal
start atau merebut port itu — dan yang mati empat proyek orang lain.

`Caddyfile` **dihapus**, diganti `infrastructure/nginx/curhatdong.conf`. Di
mesin bersama, edge proxy itu sumber daya tunggal; dua proxy berebut 443 tidak
punya solusi bagus, yang ada cuma siapa yang menang.

Yang ikut pindah ke nginx: HSTS, security header, CSP terpisah web/admin,
`X-Robots-Tag`, upgrade websocket untuk `/rt`, dan **`proxy_buffering off`
untuk SSE DONG AI** — dengan buffering menyala, balasan streaming baru sampai
setelah selesai, persis kebalikan dari streaming.

Ditambahkan `set_real_ip_from` untuk seluruh range Cloudflare +
`real_ip_header CF-Connecting-IP`, karena keempat record di-proxy CF.


## Penerbitan sertifikat

`infrastructure/scripts/issue-certs.sh` + `nginx/curhatdong-bootstrap.conf`.

- Pakai `certbot certonly --webroot`, **bukan `--nginx`**. Plugin nginx mengedit
  file config, dan di mesin yang melayani empat proyek lain, editor otomatis
  pada config nginx adalah risiko yang tidak sebanding dengan kenyamanannya.
  `certonly` tidak menyentuh config sama sekali.
- **Urutan bootstrap → terbitkan → config penuh** ada alasannya: `curhatdong.conf`
  menunjuk sertifikat yang belum ada, jadi memasangnya duluan bikin `nginx -t`
  gagal — dan config rusak berarti tidak ada yang bisa reload nginx, sementara
  siapa pun yang me-restart menjatuhkan kelima situs.
- Script memverifikasi `nginx -t` **sebelum** menambah apa pun: menumpuk file
  baru di atas config yang sudah rusak bikin penyebabnya makin susah dicari.
- `--dry-run` dijalankan lebih dulu. Let's Encrypt membatasi 5 kegagalan/jam per
  akun; percobaan yang gagal karena salah ketik domain bisa mengunci penerbitan
  satu jam.
- Semua `reload`, tidak pernah `restart`.
