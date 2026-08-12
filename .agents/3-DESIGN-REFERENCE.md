# CURHAT DONG — Design Reference (Pages & Functions) v1.1
> Turunan dari `1-PRD.md` v1.1 + `2-TECH-SPEC.md` v1.2. Referensi untuk Claude Design.
> Scope utama: **MVP Phase 1**. Item Phase 2+ ditandai `[P2]` / `[P3]` / `[P4]`.
>
> **v1.1 (12 Aug 2026)** — seluruh rujukan `PRD §NN` diperbaiki (sebelumnya memakai penomoran PDF asli yang tidak ada di `1-PRD.md`), plus 3 halaman baru dan §0.1 aksesibilitas dari PRD v1.1.

---

## 0. DESIGN DIRECTION (PRD §23)
- **Tone**: calming, warm, private, safe. HINDARI nuansa: rumah sakit, klinik, dating app, crypto, korporat.
- **Dark-friendly**: dark mode first-class (peak usage malam hari). Sediakan light mode.
- **Copywriting**: bahasa manusiawi non-klinis, gue/kamu tone Indonesia. Contoh voice: "Di sini kamu nggak harus terlihat baik-baik saja."
- **No vanity metrics di UI**: tidak ada follower count, tidak ada leaderboard popularitas, reaction count boleh disembunyikan/di-downplay.
- **Micro-interaction hangat**: reaction = kata empati (bukan like), animasi lembut, bukan gamified.
- **Midnight Mode**: malam hari (mis. 21.00–04.00) → aksen warna lebih gelap/tenang + copy home berubah: "Belum tidur? Kalau ada yang mau diceritain, gue di sini."

### Design Tokens (usulan)
- Warna: base dark navy/charcoal, aksen warm (amber/soft peach) untuk empati, hindari merah agresif kecuali destructive.
- Radius besar (16–20px), spacing lega, tipografi ramah (rounded sans).
- Ikon mood & reaction = set custom konsisten (11 mood + 6 reaction + 4 intent).

### 0.1 Aksesibilitas (PRD §23.1) — acceptance criteria, bukan polish
- **Kontras WCAG 2.1 AA**: 4.5:1 teks normal, 3:1 teks besar & elemen UI — wajib lolos di dark, light, **dan** Midnight Mode. Aksen warm di atas base gelap adalah kombinasi yang gampang gagal; cek angkanya, jangan andalkan mata.
- **Font scaling OS s/d 200%** tanpa layout pecah atau teks terpotong.
- **Label screen reader untuk semua ikon bermakna** — 11 mood, 6 reaction, 4 intent, ikon kategori. Ini interaksi inti produk; tanpa label, seluruh produk tidak terbaca oleh screen reader.
- **Makna tidak boleh disampaikan lewat warna saja** — mood dan safety state butuh label teks atau bentuk pembeda.
- **Touch target ≥ 44×44px**; focus visible + navigasi keyboard penuh (web/admin).
- **Hormati `prefers-reduced-motion`** — animasi lembut itu brand principle, tapi tetap bisa dimatikan.
- Di layar krisis (2.7), kejelasan mengalahkan kelembutan gaya: kalimat pendek, kontras tinggi, aksi jelas.

---

## 1. STRUKTUR NAVIGASI

### User App (Web responsive + Android — feature parity)
**Bottom nav mobile (PRD §23):**
```
HOME | EXPLORE | [+ CURHAT floating] | LISTEN | PROFILE
```
**Web desktop**: sidebar kiri (Home, Explore, Listen, Notifikasi, Profil) + CTA "+ Curhat" prominent + panel kanan opsional (Butuh Didengar).

### Admin App (`admin.curhatdong.com`)
Sidebar: Dashboard, Moderation, Users, Content, Listeners, Categories, AI Config, Notifications, Analytics, Audit Log, Settings.

---

## 2. USER APP — PAGES

### 2.1 Landing Page (web only) — `/`
Tujuan: konversi ke signup + download APK.
Functions/komponen:
- Hero + tagline "Kadang kita nggak butuh solusi. Kita cuma butuh didengar."
- Value props (anonim, listener manusia, DONG AI, aman)
- CTA: "Mulai Cerita" (signup), "Download APK Android"
- Preview feed anonim (dummy/curated, no real content)
- Footer: Privacy Policy, ToS, Community Guidelines, kontak
States: default, midnight variant.

### 2.2 Auth — `/auth`
**2.2a Login/Signup** — pilih metode:
- Input email → "Kirim Kode" (Email OTP)
- Tombol "Lanjut dengan Google"
- Copy reassurance: "Email kamu nggak akan pernah ditampilkan ke siapa pun."
**2.2b Verifikasi OTP** — 6-digit input, resend timer, error state (salah/expired), rate-limit state.
**2.2c Age Gate (18+)** — konfirmasi usia wajib, checkbox + penjelasan alasan; tolak → blocked screen ramah.

### 2.3 Onboarding — `/onboarding` (7 langkah, PRD §5)
1. **Welcome** — "Di sini kamu nggak harus terlihat baik-baik saja."
2. **Alasan pakai** — pilih: Mau cerita / Mau mendengarkan / Keduanya / Cuma lihat-lihat dulu.
3. **Pilih topik** — multi-select chips (15 kategori).
4. **Anonymous identity** — input alias custom ATAU generate random ("Anonymous Panda 2847"), cek ketersediaan, pilih avatar preset.
5. **Consent** `[v1.1]` (PRD §25.3) — **layar terpisah**, 3 checkbox tidak ter-check duluan:
   - ToS + Privacy Policy — **wajib** (link ke dokumen penuh)
   - Pemrosesan data spesifik — **wajib**, dijelaskan dengan bahasa manusia: "Isi curhat kamu dibaca sistem otomatis untuk menjaga keamanan dan mencocokkan kamu dengan orang yang tepat."
   - Analitik & product improvement — **opsional**, jelas boleh ditolak: "Boleh nggak diaktifin, semua fitur tetap jalan."
   - Dilarang: satu checkbox untuk semua, atau checkbox yang sudah tercentang.
   - Tombol lanjut nonaktif sampai 2 consent wajib dicentang.
6. **Safety rules** — ringkas + wajib acknowledge (aturan komunitas, larangan doxxing, info moderasi). Terpisah dari langkah 5: ini kesepakatan perilaku, bukan consent data.
7. → redirect Home. Progress indicator, bisa back, step 2–3 skippable; langkah 5 & 6 **tidak** skippable.

### 2.4 Home Feed — `/home`
Tabs (PRD §6): **Untuk Kamu** · **Terbaru** · **Butuh Didengar** · Topik · Mengikuti `[P2]`.
Functions:
- Infinite scroll (cursor), pull-to-refresh
- **Private AI Entry card**: "Lagi pengen cerita tapi belum siap ngomong ke orang? → Ngobrol sama DONG AI"
- Banner listener nudge (jika listener aktif): "Ada orang yang sedang butuh didengar."
- FAB **+ CURHAT**
- Midnight Mode copy swap
Komponen **Curhat Card** (PRD §9): identitas anonim + avatar, mood chip, category chip, waktu relatif, teks curhat (clamp + "baca selengkapnya"), intent badge, reaction bar (6 emotional reactions), jumlah komentar, CTA **"Aku siap dengerin"**, menu ⋯ (report, block, share-disabled note).
States: loading skeleton, empty per tab ("Belum ada yang cerita di sini. Mau jadi yang pertama?"), error/offline.

### 2.5 Detail Curhat — `/post/:id`
Functions:
- Post lengkap + reaction bar full
- Komentar & reply (nested 1 level), react di komentar
- Author-only: tandai komentar **"Jawaban ini membantu gue"** (badge di komentar)
- Composer komentar (dengan quick-check doxxing warning)
- Author-only: hapus post, matikan komentar
- Report/block dari tiap komentar
- **Felt Heard prompt** (bottom sheet, muncul setelah dapat respons): "Kamu merasa sedikit lebih baik setelah cerita?" → Iya, merasa didengar / Sedikit / Belum
States: post ditahan (L2) "Curhatmu sedang ditinjau", post dihapus, komentar dikunci.

### 2.6 Create Curhat — `/create` (modal web / full screen mobile)
Prompt: **"Hari ini kamu mau cerita apa?"**
Functions (PRD §7):
- Title (opsional), Body (autosave draft lokal)
- Pilih **Category** (bottom sheet)
- Pilih **Mood** (11): Sedih, Marah, Cemas, Capek, Patah hati, Kosong, Overthinking, Lega, Senang, Bersyukur, Bingung
- Pilih **Intent** (4): Aku cuma mau didengar / Aku butuh saran / Aku butuh dukungan / Ada yang pernah ngalamin?
- Toggle **Anonymity**: alias tetap vs Anonymous #XXXX
- Toggle allow comments · Toggle "sekalian cari listener"
- **Anti-doxxing warning** (inline, pre-submit): "Sepertinya curhatanmu berisi informasi pribadi. Kamu yakin ingin membagikannya?"
- Submit → state: publish sukses / **held (L2)**: "Curhatmu kami tinjau dulu sebentar ya" / **L3 → Supportive Intervention screen**

### 2.7 Supportive Intervention — (overlay/screen, Level 3, PRD §8 + SOP §15.1)
KRITIS — desain paling hati-hati:
- Tone hangat, TANPA menghakimi, TANPA bahasa klinis dingin
- Pesan empati singkat + daftar **emergency/support resources Indonesia** (hotline, layanan chat) — tap-to-call/chat
- CTA sekunder: "Ngobrol sama DONG AI" / "Cari Listener sekarang"
- TIDAK ada tombol punish/blokir; tidak menampilkan skor/level ke user
- User tetap bisa keluar dengan tenang ("Aku mengerti, tutup")

### 2.8 DONG AI — `/ai`
**2.8a List percakapan** — riwayat + "Mulai ngobrol baru".
**2.8b Pilih personality** (PRD §10): Pendengar / Pemikir / Teman Hangat / Teman Santai / Journal Companion `[P2]` — kartu dengan deskripsi singkat.
**2.8c Chat screen**:
- Bubble chat, **streaming** balasan, typing indicator AI
- Disclaimer permanen halus: "DONG AI teman ngobrol, bukan psikolog."
- **AI→Human Bridge card** (in-chat, kontekstual): "Ada beberapa orang yang pernah mengalami situasi mirip dan siap mendengarkan. → **Cari Listener**"
- In-chat safety resources (jika risiko terdeteksi)
- Quota harian indicator + state limit tercapai ("Kuota harian habis — besok kita lanjut ya" + CTA Cari Listener)
- Ganti mode personality mid-chat

### 2.9 LISTEN (hub listener) — `/listen`
**2.9a Aktivasi Listener** (first time): explainer "Aku Siap Mendengarkan" → **Listener Guidelines** (wajib scroll + accept; batasan: bukan konselor, kapan escalate) → setup: topik yang dikuasai, bahasa, max concurrent session.
**2.9b Listener Dashboard**: toggle besar **Available / Unavailable**, statistik ringkas (sesi, helpful score, Felt Heard score), edit preferensi, riwayat sesi.
**2.9c Incoming Match Offer** (modal/push-driven, TTL 60 dtk): topik + mood + emotion requester (TANPA identitas), countdown, tombol **Terima** / **Lewati**.

### 2.10 Cari Listener (requester flow) — `/listener/request`
- Entry: dari AI bridge, dari create curhat, dari tombol di Home
- Form ringan: topik + apa yang dirasakan (prefill dari post/AI)
- **Searching state**: animasi tenang "Lagi nyariin orang yang tepat buat dengerin kamu…" + estimasi
- **Matched**: "Seseorang siap mendengarkan" → masuk room
- **Gagal/timeout**: empati + alternatif: DONG AI / posting ke Butuh Didengar / coba lagi

### 2.11 Private Curhat Room — `/room/:id` (PRD §11)
Functions:
- Realtime chat text, typing indicator, online/presence status
- Header: alias + role (Listener/Requester), menu: **Report**, **Block**, **Akhiri Sesi**
- Safety notice awal room (sekali): "Percakapan ini dipantau sistem keamanan otomatis. Jaga privasimu."
- Screenshot protection aktif (Android FLAG_SECURE) + disclaimer jujur
- Idle/closed state → **Session Feedback**
**2.11b Session Feedback** (PRD §11): requester → "Kamu merasa didengar?" (Iya/Sedikit/Belum); listener → "Percakapan berjalan aman?" (Ya/Tidak + alasan bila tidak) → thank-you state ("Makasih udah mau dengerin 🤍").

### 2.12 Explore / Topik — `/explore`
- Grid/list 15 kategori (icon + nama + jumlah curhat aktif)
- Kategori → feed per topik
- Search bar → 2.13
- `[P2]` Communities section

### 2.13 Search — `/search`
- Cari berdasarkan: keyword, topik, listener
- Tabs hasil: Curhat / Listener / Topik
- Empty state hangat; recent searches (lokal)

### 2.14 Notifikasi — `/notifications`
- List in-app notif per tipe (PRD §14): Social ("Ada yang lagi dengerin ceritamu"), Response ("Ada seseorang yang membalas curhatanmu"), Listener nudge, AI reminder (opsional)
- **Isi curhat/chat TIDAK pernah tampil** — template generik saja
- Read/unread, tap → deep link
- Shortcut ke Notification Settings

### 2.15 Profil — `/profile/:alias`
**Public view** (PRD §16): alias, avatar, bio, badge Listener (jika aktif), joined date, helpful reactions. TANPA email/phone/identitas/followers.
**Own view**: + edit profil, statistik pribadi, riwayat curhat sendiri (private list), shortcut Settings.
Aksi di profil orang lain: Cari sebagai listener (jika available), Report, Block.

### 2.16 Settings — `/settings`
- **Akun**: ganti alias, avatar, logout, **logout semua device**
- **Notifikasi**: granular per tipe (social/response/listener/AI) per channel (push/in-app)
- **Privasi**: default anonymity, AI consent `[P2 journal]`, blocked list (unblock)
- **Data**: download data, **Delete Account** flow — pilih: hapus konten vs anonymize → konfirmasi ganda → goodbye screen hangat
- **Tentang**: Privacy Policy, ToS, Community Guidelines, versi app
- Theme: dark/light/system

### 2.17 Modal & Sheet Global
- **Report sheet** (PRD §15): pilih kategori (Bullying, Harassment, Sexual, Hate, Threat, Scam, Doxxing, Spam, Dangerous content, Other) + catatan → confirm → "Laporanmu kami terima."
- **Block confirm**: jelaskan efek block
- **Felt Heard prompt** (bottom sheet)
- **Reaction picker** (long-press): 6 reaksi
- Toast/error patterns, offline banner
- Force update / maintenance screen (mobile)

### 2.18 `[P2+]` Pages (untuk roadmap desain)
- DONG Journal (private, editor + mood tag) `[P2]`
- Mood History (chart 7/30/90 hari, non-diagnostik) `[P2]`
- Voice Note composer/player `[P2]`
- Community list & detail `[P2]`
- CURHAT+ paywall & manage subscription `[P2]`
- Anonymous Voice Room (host/speaker/listener) `[P3]`
- Virtual Gift picker `[P3]`
- Professional Marketplace `[P4]`

---

> **`[v1.1]` Halaman MVP baru dari PRD v1.1.** Ditempatkan di akhir daftar agar penomoran 2.1–2.18 yang sudah dirujuk di tempat lain tetap valid — semuanya **scope MVP**, bukan Phase 2.

### 2.19 `[v1.1]` Banding Moderasi — `/moderation/actions` & `/moderation/appeal/:actionId`
Dari PRD §15.4. Tanpa halaman ini, user yang kena tindakan tidak punya jalan keluar sama sekali.
- **Daftar tindakan**: aksi terhadap akun sendiri (dihapus/peringatan/mute/suspend/ban) — kategori alasan, tanggal, durasi bila ada, status banding.
- Copy tegas tapi tidak menghakimi: "Komentar kamu dihapus karena melanggar aturan soal X. Kalau menurut kamu ini keliru, kamu bisa ajukan banding."
- **Form banding**: textarea alasan, sisa waktu window (14 hari), notice "1 banding per tindakan".
- **States**: belum bisa banding (bukan aksi appealable), window habis, sudah pernah banding, menunggu (dengan estimasi 7 hari), hasil `upheld` / `overturned` / `reduced`.
- Hasil disampaikan dengan bahasa manusia, bukan status kode. `overturned` → tampilkan konfirmasi konten/akun sudah dipulihkan.
- Entry point: notifikasi tindakan + Settings → Akun.

### 2.20 `[v1.1]` Listener Limit & Istirahat — state di `/listen`
Dari PRD §11.2. Bukan halaman penuh, tapi rangkaian state yang harus didesain sengaja:
- **Cooldown** (10 mnt): toggle Available tampak nonaktif sementara + countdown, copy netral: "Ambil napas dulu sebentar ya."
- **Cap harian tercapai** (8 sesi): availability auto-off, tone **apresiatif bukan peringatan** — "Kamu udah dengerin 8 orang hari ini. Istirahat dulu 🤍". Tidak ada tombol untuk memaksa lanjut.
- **Reminder istirahat** (3 sesi berturut / 90 mnt aktif): banner lembut, bisa di-dismiss.
- **Konkuren penuh** (3 sesi): offer tidak masuk; jelaskan kenapa, jangan diam-diam.
- Penting: tidak ada satu pun state di atas yang boleh terasa seperti hukuman atau penurunan peringkat.

### 2.21 `[v1.1]` Data & Privasi — `/settings/data`
Dari PRD §25.2 & §25.4. Memperluas bagian "Data" di 2.16.
- **Kelola consent**: 3 consent dengan status + tanggal; analitik bisa dimatikan kapan saja, dengan penegasan "semua fitur tetap jalan".
- **Download data**: minta export → state processing → link unduh (kedaluwarsa).
- **Delete Account** — dua pilihan dengan konsekuensi ditulis jujur:
  - *Hapus konten* — post/komentar/pesan AI dihapus setelah masa tunggu 30 hari.
  - *Anonymize* — konten tetap ada tanpa kaitan ke kamu. **Tidak bisa dibatalkan**, dan setelahnya konten itu tidak bisa dihapus lagi.
  - Wajib ditampilkan: pesan di private room **tidak** hilang dari sisi lawan bicara, dan salinan di backup baru hilang dalam 30 hari.
  - Konfirmasi ganda → goodbye screen hangat.
- Prinsip copy: jangan pernah menjanjikan "terhapus seketika dari semua sistem" kalau kenyataannya tidak begitu.

---

## 3. ADMIN APP — PAGES (`admin.curhatdong.com`)

### 3.1 Login Admin — `/login`
Email+password → **MFA TOTP** wajib → dashboard. State: MFA setup pertama kali, lockout.

### 3.2 Dashboard — `/`
Metric cards (PRD §18 + definisi operasional §19.1): Total Users, New Users, DAU/WAU/MAU, Active Listeners, Curhat/day, Comments/day, AI Conversations, Listener Sessions, **Report Rate**, **Felt Heard Rate**. Grafik tren + filter tanggal. Alert strip: antrian Critical > 0.

### 3.3 Moderation Queue — `/moderation`
- Tabs prioritas: **Critical** / High / Medium / Low (badge count, Critical menyala)
- Row: sumber (AI/report/system), target, kategori risiko, umur case, assigned
- **Case Detail**: konten (akses di-log + banner "akses diaudit"), riwayat safety user, klasifikasi AI (level, skor), riwayat report
- Aksi (PRD §15): Approve · Remove · Warn · Mute · Suspend · Ban · Escalate — wajib alasan; bulk action untuk Low
- SLA timer visual untuk Critical

### 3.4 User Management — `/users`
- Search (alias/ID/email-hash), filter status
- Detail user: status akun, trust/safety history, reports by/against, devices/risk, sesi listener
- Aksi: warn/mute/suspend/ban/unban (+ durasi & alasan)
- Akses private content: hanya via case aktif, dialog konfirmasi "akses ini dicatat di audit log"

### 3.5 Content Management — `/content`
- List post (filter: reported, held, level, kategori)
- Aksi: inspect, remove, restore, lock comments, add warning, suspend author

### 3.6 Listener Management — `/listeners`
- List listener + skor (helpful, felt heard, safety status)
- Aksi: suspend listener mode, review reports, verify `[P3]` / revoke

### 3.7 Category Management — `/categories`
CRUD kategori: nama, slug, icon picker, display order (drag), archive.

### 3.8 AI Moderation Config — `/ai-config`
- Threshold per kategori risiko (slider), auto-action mapping per level
- Model routing config (cheap vs advanced), prompt version selector
- **Semua perubahan → audit trail** + diff viewer; tombol rollback prompt version

### 3.9 Notification CMS — `/notifications`
Compose broadcast (announcement/maintenance/campaign/safety), target segment, schedule, **rate control** + konfirmasi jumlah penerima, riwayat kiriman.

### 3.10 Analytics — `/analytics`
Funnel (PRD §19 + §19.1): signup → onboarding done → first curhat → first reply → first listener session; retention D1/D7/D30; response coverage; median time-to-first-response; Felt Heard trend; AI usage & cost.

### 3.11 Audit Log — `/audit`
Filter aktor/aksi/target/tanggal; detail diff; export.

### 3.12 Admin Settings — `/settings`
Kelola admin & role (RBAC: Super Admin, Moderator, Customer Support, Finance `[P2]`, Content Manager), feature flags toggle, app configs (rate limits, SLA, kuota AI, quiet hours).

### 3.13 `[v1.1]` Appeal Review — `/appeals`
Dari PRD §15.4.
- Queue banding: umur case, sisa SLA (7 hari), aksi asal, kategori, moderator pemutus.
- **Banding yang diputus oleh moderator itu sendiri tidak muncul di queue-nya** — sistem yang menyembunyikan, bukan mengandalkan kejujuran. Kalau tidak ada reviewer lain, otomatis naik ke Super Admin.
- Detail: alasan user, konten terkait (akses di-log + banner audit), riwayat safety, klasifikasi AI asli.
- Keputusan: `Upheld` / `Overturned` / `Reduced` (+ durasi baru) — wajib alasan, dikirim ke user.
- Widget kalibrasi: **rasio overturned per kategori risiko**. Kategori dengan rasio tinggi berarti threshold AI-nya yang salah — link langsung ke `/ai-config`.

### 3.14 `[v1.1]` Support Resources — `/support-resources`
Dari PRD §15.2.
- CRUD hotline per region: nama, kanal (telepon/chat/WA/web), value, jam operasional, bahasa, aktif.
- Kolom **`verified_at`** menonjol; entri kedaluwarsa (>3 bulan) ditandai merah dan **otomatis tidak ditampilkan ke user**.
- Wajib isi `source_url` saat membuat/memverifikasi entri.
- Preview: tampilan persis seperti yang dilihat user di layar krisis (2.7) — supaya kesalahan ketahuan sebelum tayang.
- Empty state adalah **peringatan keras**, bukan state netral: tanpa resource tervalidasi, layar krisis kehilangan isinya.

---

## 4. FUNCTION INVENTORY (ringkas per domain)

**Auth & Account**: request/verify email OTP · Google login · refresh/rotate token · logout (satu/semua device) · age gate confirm `[v1.1: + cooldown saat ditolak]` · **consent grant/revoke (3 jenis)** `[v1.1]` · onboarding save · edit alias/avatar/bio · download data (export request + unduh) · delete account (hapus/anonymize).
**Post & Feed**: create curhat (title/body/category/mood/intent/anonymity/allow-comments/request-listener) · draft autosave · feed 4 tab cursor · post detail · delete own post · lock comments (author) · noindex semua post page.
**Interaksi**: 6 emotional reactions (set/unset, post & comment) · comment · reply · mark helpful (author) · felt heard answer (post & session).
**Safety (user-facing)**: anti-doxxing pre-submit warning · report (10 kategori) · block/unblock · supportive intervention L3 + hotline resources (post, komentar, DONG AI, **dan private room** `[v1.1]`) · "sedang ditinjau" L2 state · safety notice di room · **lihat tindakan moderasi terhadap akun sendiri + ajukan banding** `[v1.1]`.
**DONG AI**: start conversation · pilih/ganti personality (5 mode) · kirim pesan (stream) · daily quota · AI→Human bridge (Cari Listener) · in-chat risk resources · riwayat percakapan.
**Listener**: aktivasi + accept guidelines (versi tercatat) · set topik/bahasa/max concurrent · toggle availability · terima/lewati match offer (TTL, **tanpa penalti skor** `[v1.1]`) · request listener · matching states (searching/matched/failed) · private room (send/typing/presence) · **tombol escalate ke moderator** `[v1.1]` · end session · feedback dua arah · listener stats · **cooldown / cap harian / reminder istirahat** `[v1.1]`.
**Notifikasi**: register device (Expo/FCM/web push) · in-app list · granular settings · **quiet hours 22.00–07.00, kecuali notifikasi safety/akun** `[v1.1]` · deep link · konten notif selalu generik.
**Search**: keyword/topik/listener · tabs hasil · recent searches.
**Admin**: login+MFA · dashboard metrics · moderation queue 4 level + 7 aksi + **SLA timer/compliance** `[v1.1]` · **appeal review (reviewer ≠ pemutus)** `[v1.1]` · user mgmt + akses teraudit · content mgmt · listener mgmt · kategori CRUD · **support resources CRUD + verified_at** `[v1.1]` · AI config + audit trail · broadcast rate-controlled · analytics funnel/retention · audit log · RBAC & feature flags.

**Compliance** `[v1.1]`: consent record (grant/revoke/versi) · retention job terjadwal + `retention_runs` · data export · delete/anonymize dengan konsekuensi eksplisit · audit log akses konten privat.

---

## 5. SHARED COMPONENT LIBRARY (untuk Claude Design)
1. **CurhatCard** (feed) — varian: default, butuh-didengar (highlight), anonymous, held
2. **ReactionBar** + ReactionPicker (6 reaksi berlabel kata)
3. **MoodChip** (11) & MoodPicker grid
4. **IntentBadge** (4) & IntentSelector
5. **CategoryChip** & CategorySheet
6. **CommentItem** (+helpful badge, nested reply)
7. **ChatBubble** (room & AI, varian streaming)
8. **ListenerCard** (profil ringkas listener)
9. **MatchOfferModal** (countdown)
10. **FeltHeardSheet**
11. **ReportSheet** / BlockDialog
12. **SafetyResourceCard** (hotline, tap-to-call)
13. **EmptyState** ilustrasi hangat (per konteks)
14. **BottomNav** + FAB "+ Curhat"
15. **AdminDataTable**, **QueueRow**, **MetricCard**, **AuditDiffViewer**
16. `[v1.1]` **ConsentCheckbox** — label plain-language, tidak pernah pre-checked, penanda wajib/opsional
17. `[v1.1]` **AppealStatusCard** — state: bisa banding / window habis / menunggu / upheld / overturned / reduced
18. `[v1.1]` **RestStateBanner** — cooldown, cap harian, reminder istirahat listener (tone apresiatif, bukan peringatan)
19. `[v1.1]` **SlaTimer** (admin) — sisa waktu SLA, merah saat lewat
20. `[v1.1]` **DestructiveConfirm** — konfirmasi ganda untuk aksi tak-bisa-dibatalkan (anonymize, delete), konsekuensi ditulis eksplisit sebelum tombol

> Total MVP: **±27 user pages/screens + 14 admin pages + 20 shared components**.
> Perubahan v1.1: +3 halaman user (2.19 Banding, 2.20 Listener limit state, 2.21 Data & Privasi), +2 halaman admin (3.13 Appeal Review, 3.14 Support Resources), +5 shared component, +1 langkah onboarding (Consent).
