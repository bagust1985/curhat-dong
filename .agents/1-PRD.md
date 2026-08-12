# CURHAT DONG — Master PRD v1.1 (Markdown)

> Dikonversi dari `CURHAT_DONG_Master_PRD_v1.pdf` (12 Aug 2026). Domain production: **curhatdong.com** (bukan .id seperti di PDF).
> Tagline: "Kadang kita nggak butuh solusi. Kita cuma butuh didengar."
>
> **v1.1 (12 Aug 2026)** — menutup 15 gap sebelum tasking. Struktur §1–24 tidak diubah urutannya; penambahan masuk sebagai sisipan bertanda `[v1.1]` di bagian terkait, plus bagian baru §25. Lihat [CHANGELOG](#changelog) di akhir dokumen.
>
> **Konvensi nilai usulan:** angka yang belum pernah ditetapkan ditandai `(usulan)` dan disertai rasional. Semua nilai `(usulan)` masih bisa direvisi dan direkap di §25.7 untuk sign-off.

## 1. Vision & Positioning
- **Emotional Social Network** — tempat bercerita aman tanpa tekanan identitas/popularitas/follower.
- BUKAN: terapi medis, AI therapist, aplikasi diagnosis, Instagram/X anonim, dating app, forum gosip.
- Positioning: **A Safe Place To Talk** = Anonymous Social + Human Listener + AI Companion + Community + Emotional Matching.
- Brand principle: interaksi manusiawi, emotional reactions (bukan Like), copywriting non-klinis.

## 2. Target User & Roles
- Usia 18–40, market awal Indonesia, 18+ age gate (wajib konfirmasi usia).
- Persona: Silent Overthinker, Night Curhat User, Relationship User, Worker (burnout), Listener.
- Roles: **User**, **Listener** (aktifkan "Aku siap mendengarkan"), Verified Listener (future), Professional (future), **Moderator**, **Super Admin**.
- Admin RBAC: Super Admin, Moderator, Customer Support, Finance, Content Manager.

## 3. Platform
- **Web**: responsive (desktop/tablet/mobile browser).
- **Android**: native-like, output **APK + AAB**, feature parity dengan web untuk fitur utama.
- **Admin panel** terpisah: `admin.curhatdong.com`.

## 4. Identity & Auth
- Registrasi MVP: **Email OTP + Google Login** (future: Apple, Phone OTP). Email/phone tidak pernah tampil publik.
- **Anonymous Identity System**: persistent alias (mis. `LangitMalam`) + mode **Anonymous Post** (`Anonymous #A7392`). Backend tetap simpan relasi post↔account (moderation/legal), tidak diekspos ke user lain.

## 5. Onboarding
Welcome → pilih alasan (cerita / mendengarkan / keduanya / lihat-lihat) → pilih topik → pilih anonymous identity → **consent & safety rules** → Home.

`[v1.1]` Langkah "safety rules" v1.0 digabung dengan **layar consent terpisah** — lihat §25.3. Consent dan aturan komunitas bukan hal yang sama: satu adalah dasar hukum pemrosesan data, satu lagi adalah kesepakatan perilaku. Menggabungkannya jadi satu checkbox membuat consent-nya tidak sah.

## 6. Home Feed
Tabs: **Untuk Kamu** (emotional matching), **Terbaru**, **Butuh Didengar** (post minim respons), Mengikuti (future), **Topik**.

## 7. Create Curhat
CTA utama `+ CURHAT`. Input: title (opsional), body, category, mood, anonymity mode, allow comments, request listener, request advice.
**Curhat Intent**: Aku cuma mau didengar / Aku butuh saran / Aku butuh dukungan / Ada yang pernah ngalamin? → sinyal matching AI.
**Mood**: Sedih, Marah, Cemas, Capek, Patah hati, Kosong, Overthinking, Lega, Senang, Bersyukur, Bingung.

## 8. AI Pre-Publish Analysis & Safety Levels
AI Safety Engine analisis sebelum publish: toxicity, hate, threat, sexual exploitation, harassment, scam, spam, doxxing, personal data, self-harm risk, violence risk + deteksi emotion/topic/intent/urgency.
- **Level 0 Normal** → publish langsung.
- **Level 1 Sensitive** → publish + monitoring tambahan.
- **Level 2 Potential Harm** → konten ditahan, direview.
- **Level 3 Immediate Risk** → JANGAN hukum user otomatis; tampilkan supportive intervention + emergency/support resources sesuai lokasi; buat moderation escalation.

## 9. Interaksi Sosial
- **Reactions** (bukan Like): Aku ngerti, Peluk virtual, Aku dengerin, Aku pernah di situ, Tetap kuat, Cerita lagi. Reaction count boleh disembunyikan (bukan popularity competition).
- **Comments**: comment, reply, react, report, block. Author bisa tandai "Jawaban ini membantu gue" → sinyal positif recommendation engine.
- **Felt Heard System** (core differentiator): setelah interaksi, author diprompt "Kamu merasa sedikit lebih baik setelah cerita?" → Iya/Sedikit/Belum → **Felt Heard Score** (evaluasi listener, reply, matching, community health — bukan diagnosis).
- **North Star Metric: Felt Heard Rate.**
- `[v1.1]` **Anti-fatigue Felt Heard** — prompt ini punya dua sisi: kalau ditanya terlalu sering, user terganggu **dan** North Star Metric-nya tercemar oleh jawaban asal. Aturan frekuensi:
  - maksimal **1× per post** dan **1× per sesi listener** (usulan);
  - maksimal **3× per hari per user** (usulan);
  - **delay 30 menit** setelah respons manusia pertama masuk (usulan) — jangan tanya di detik yang sama respons datang, user belum sempat membacanya;
  - user bisa **dismiss** (tidak dihitung sebagai "Belum") dan bisa **matikan permanen** dari Settings;
  - prompt yang di-dismiss tidak diulang untuk post yang sama.
  - *Rasional:* Felt Heard Rate hanya berguna kalau jawabannya jujur. Prompt yang memaksa menghasilkan metrik yang terlihat bagus tapi tidak mengukur apa pun.

## 10. DONG AI
- Positioning: "Teman ngobrol ketika kamu belum siap bicara dengan orang lain." Bukan AI Psychologist.
- Personality modes: Pendengar, Pemikir, Teman Hangat, Teman Santai, Journal Companion.
- **AI Rules — dilarang**: mengaku dokter/psikolog manusia, diagnosis medis, resep obat, mendorong ketergantungan emosional, mendorong isolasi dari manusia nyata.
- **AI harus bisa**: mendengarkan, bertanya natural, merapikan pikiran, **menawarkan human listener (AI→Human Bridge, CTA: Cari Listener)**, merekomendasikan professional help bila appropriate.
- `[v1.1]` **AI Cost Guard** (menutup §24.4):
  - **Kuota user**: 50 pesan/hari/user (usulan, sinkron dengan Tech Spec §4.7). Saat habis: pesan hangat + CTA Cari Listener, bukan error mentah.
  - **Model routing**: task murah (tagging, emotion, intent, spam) → cheap model; percakapan kompleks & safety ambigu → advanced model.
  - **Budget alert**: notifikasi ops di **70%** dan **90%** dari `AI_DAILY_BUDGET` harian (usulan).
  - **Degradasi bertahap** di ≥90% budget: seluruh routing **non-safety** turun ke cheap model; kuota user harian dipotong ke 25 pesan (usulan).
  - **Klasifikasi safety TIDAK PERNAH didegradasi, di-skip, atau dimatikan karena alasan biaya.** Kalau budget habis total, yang berhenti adalah percakapan DONG AI — bukan analisis safety. Mematikan safety demi biaya = safety bypass lewat pintu belakang, melanggar prinsip §8 dan aturan non-negotiable #1.
  - **Observability wajib**: setiap panggilan AI mencatat provider, model, operation, token in/out, cost estimate, latency, fallback_used, prompt_version.
  - *Rasional:* biaya AI adalah satu-satunya biaya variabel yang bisa meledak tanpa batas di MVP ini. Guard-nya harus ada sejak hari pertama, bukan setelah tagihan pertama datang.

## 11. Listener System
- Listener mode: available/unavailable, topic preference, language, text (voice future), max concurrent session.
- Listener profile: alias, experience topic, jumlah session, helpful score, Felt Heard score, safety status. Tanpa popularity leaderboard.
- **Matching engine**: language, topic, emotion, listener experience, availability, previous helpfulness, safety score, blocked relationships, previous interactions.
- **Request flow**: user butuh didengar → system detect topic → search listener → match candidate → listener accept → private room → conversation → session closed → feedback.
- **Private Curhat Room (MVP text-based)**: realtime messaging, typing indicator, online status, block, report, leave room, safety monitoring. Tanpa phone/identitas asli.
- **Session feedback**: user "Kamu merasa didengar?"; listener "Percakapan berjalan aman?" → ranking, trust score, safety.
- `[v1.1]` **Cakupan bahasa MVP**: Bahasa Indonesia saja. Field `language` di matching tetap disiapkan (single-value) supaya ekspansi regional Phase 4 tidak butuh migration, tapi MVP tidak menjanjikan listener berbahasa lain.

### 11.1 `[v1.1]` Listener Guidelines (wajib, menutup §24.3)
Wajib dibaca + di-accept sebelum listener mode aktif. Acceptance dicatat (versi guidelines + timestamp) untuk audit.

Isi minimum:
1. **Listener bukan konselor, terapis, atau tenaga medis.** Dilarang mendiagnosis, menyarankan/menghentikan obat, atau mengklaim kualifikasi profesional.
2. **Tugasnya mendengarkan**, bukan menyelesaikan masalah orang. Tidak apa-apa kalau tidak punya jawaban.
3. **Kerahasiaan**: dilarang menyebarkan isi sesi ke mana pun, termasuk screenshot.
4. **Batas personal**: dilarang menukar kontak pribadi, meminta identitas asli, mengarahkan ke platform lain, atau menjalin hubungan romantis/transaksional dari sesi.
5. **Kapan harus escalate** (lihat §11.3) dan cara pakai tombolnya.
6. **Boleh berhenti.** Mengakhiri sesi karena tidak sanggup bukan kegagalan — itu justru yang benar.

### 11.2 `[v1.1]` Perlindungan Burnout Listener (menutup §24.3)
Listener adalah volunteer non-profesional yang menyerap cerita berat. Tanpa batas, yang terjadi bukan cuma churn — listener-nya sendiri bisa kena dampak. Batas berikut bersifat sistem, bukan imbauan:

- max **3 sesi konkuren** (usulan; user tetap bisa menurunkannya sendiri, tidak bisa menaikkan);
- max **8 sesi selesai per hari** (usulan) → setelahnya availability auto-off dengan pesan apresiatif, bukan peringatan;
- **cooldown 10 menit** antar sesi (usulan) — tidak menerima offer baru selama cooldown;
- **reminder istirahat** setelah 3 sesi berturut-turut atau 90 menit aktif (usulan);
- listener boleh set **unavailable kapan saja**, termasuk saat sedang ada offer masuk;
- menolak/melewatkan offer **tidak menurunkan skor** listener. Ranking tidak boleh menghukum orang yang menjaga batasnya sendiri.

### 11.3 `[v1.1]` Escalation Path Listener → Moderator
Kalau requester menunjukkan indikasi risiko tinggi (L3) di tengah sesi:
1. Listener tekan **Escalate** di room (selalu terlihat, bukan di menu tersembunyi).
2. Sistem langsung membuat `safety_event` + moderation case **Critical**, dan menampilkan **support resources** ke requester (§15).
3. Listener diberi panduan singkat di layar: tetap hadir, jangan menjanjikan penyelamatan, jangan berjanji merahasiakan hal yang membahayakan nyawa.
4. Sesi **tidak** ditutup otomatis dan requester **tidak** diblokir/dihukum — konsisten dengan §8 Level 3.
5. Listener boleh keluar dari sesi setelah escalate tanpa penalti, dan ditawari follow-up ringan ("Makasih. Kamu udah lakuin yang benar.").

## 12. Journal & Mood (Phase 2)
- DONG Journal privat by default, tidak pernah masuk feed; AI hanya boleh analisis setelah explicit consent.
- Mood history 7/30/90 hari, bukan diagnosis.

## 13. Search & SEO
- Search: topic, keyword, community, listener.
- **Privacy-first SEO: NOINDEX default** untuk curhat personal; hanya curated/public content yang eksplisit diizinkan boleh diindeks.

## 14. Notification
- Android: FCM. Web: web push. Contoh: "Ada seseorang yang membalas curhatanmu", listener nudge "Ada orang yang sedang butuh didengar". Granular controls per user. (Catatan implementasi: isi curhat/chat tidak boleh tampil di notif.)
- `[v1.1]` **Quiet hours**: default **22.00–07.00 waktu lokal user** (usulan) — push ditahan dan dikirim setelah jendela berakhir, atau di-drop kalau sudah tidak relevan. User bisa mengubah atau mematikan quiet hours.
  - **Pengecualian**: notifikasi terkait safety/akun (mis. hasil banding, tindakan moderasi terhadap akun sendiri) tetap dikirim.
  - **Bukan pengecualian**: listener nudge dan notifikasi sosial — justru itu yang paling mengganggu tengah malam.
  - *Catatan produk:* Midnight Mode (§23) mengasumsikan user **membuka** app malam hari atas kemauan sendiri. Itu berbeda jauh dari app yang **membangunkan** user. Yang pertama menenangkan, yang kedua bikin uninstall.

## 15. Safety & Trust
- **Block**: no DM, saling tidak terlihat, no matching, no comment.
- **Report categories**: Bullying, Harassment, Sexual, Hate, Threat, Scam, Doxxing, Spam, Dangerous content, Other. Urgent report = priority.
- **Trust Score** internal-only: account age, behavior, reports, helpful interaction, spam, blocks, moderation history.
- **Safety Engine**: Content → Rule Engine → AI Moderation → Risk Classification → Publish/Review/Intervention.
- **Human moderation** wajib (AI bukan satu-satunya moderator). Queue: Critical/High/Medium/Low. Aksi: approve, remove, warn, mute, suspend, ban, escalate.
- **Anti-spam**: mass posting, duplicate, mass DM, malicious link, scam keyword, bot; tools: rate limit, account trust, device risk, CAPTCHA bila perlu.
- **Anti-doxxing**: deteksi no. telepon/alamat/NIK/email/rekening/lokasi persis → warning "Sepertinya curhatanmu berisi informasi pribadi…".
- **Anti-virality**: konten sensitif tidak dipromosikan karena engagement tinggi. Safety > virality.
- **Private message safety**: automated analysis dengan policy transparan; human access hanya bila reported/serious safety/legal/authorized debugging — semua access di-log.
- **Screenshot privacy**: FLAG_SECURE di Android private room bila supported; jangan janjikan 100% impossible.

### 15.1 `[v1.1]` SOP Crisis Level 3 (menutup §24.2)
§8 menetapkan *prinsip* Level 3. Bagian ini menetapkan *prosedurnya*. Berlaku untuk L3 yang terdeteksi di **mana pun**: pre-publish post, komentar, percakapan DONG AI, maupun pesan di private room — bukan hanya pre-publish post seperti pembacaan v1.0.

```
Deteksi L3 (AI / rule engine / laporan / escalate listener)
        │
        ├─► Ke USER: Supportive Intervention
        │     ├── pesan empati, tanpa menghakimi, tanpa bahasa klinis
        │     ├── support resources sesuai region (§15.2), tap-to-call/chat
        │     ├── CTA: "Ngobrol sama DONG AI" / "Cari Listener"
        │     ├── TANPA punish, TANPA suspend, TANPA tampilkan skor/level
        │     └── user bisa menutup dengan tenang
        │
        ├─► Ke KONTEN: post tidak masuk feed; pesan room TIDAK dihapus
        │     (menghapus percakapan yang sedang berjalan justru memutus
        │      satu-satunya kontak manusia yang sedang dimiliki user)
        │
        └─► Ke SISTEM: safety_event + moderation case Critical
              ├── SLA sesuai §15.3
              ├── moderator review (bukan AI sebagai pemutus tunggal)
              └── follow-up: cek 24 jam kemudian apakah user kembali aktif
```

Aturan tegas:
- **Jangan pernah menghukum user karena Level 3.** L3 adalah sinyal orang butuh bantuan, bukan pelanggaran.
- **Jangan menjanjikan apa yang tidak bisa ditepati** — dilarang menulis copy seperti "kami akan menghubungi kamu" kalau tidak ada tim yang benar-benar melakukannya.
- **Jangan menampilkan level/skor risiko ke user.**
- L3 yang terdeteksi dari **listener escalate** mengikuti §11.3.
- Moderator yang menangani case Critical perlu panduan tertulis + rotasi; menangani konten krisis terus-menerus juga melelahkan.

### 15.2 `[v1.1]` Support Resources / Hotline (menutup §24.2)
Daftar hotline **tidak di-hardcode**. Disimpan sebagai konfigurasi (`app_configs`) dan dikelola dari admin, dengan skema minimum:

| Field | Keterangan |
|---|---|
| `region` | kode wilayah (MVP: `ID`) |
| `name` | nama layanan |
| `channel` | `phone` / `chat` / `whatsapp` / `web` |
| `value` | nomor atau URL |
| `hours` | jam operasional (mis. 24/7, atau rentang jam) |
| `language` | bahasa layanan |
| `verified_at` | tanggal terakhir diverifikasi |
| `source_url` | sumber resmi rujukan |

Aturan:
- **Nomor hotline wajib diverifikasi dari sumber resmi sebelum tayang.** Dokumen ini sengaja **tidak** mencantumkan nomor spesifik — hotline yang salah/mati lebih berbahaya daripada tidak menampilkan apa pun, karena user dalam krisis mencoba lalu gagal.
- **Re-verifikasi berkala** (usulan: tiap 3 bulan) dan tampilkan hanya entri dengan `verified_at` yang masih dalam masa berlaku.
- Kalau tidak ada resource tervalidasi untuk region user, tampilkan alternatif jujur (DONG AI, Cari Listener, saran menghubungi orang terdekat/IGD) — jangan tampilkan nomor asal-asalan.
- `⚠️ ACTION REQUIRED:` daftar hotline Indonesia yang valid perlu dikumpulkan + diverifikasi manual sebelum go-live. Ini blocker rilis, bukan nice-to-have.

### 15.3 `[v1.1]` SLA Moderasi (menutup §24.2)
Target waktu respons pertama moderator, dihitung sejak case dibuat (semua usulan):

| Queue | Siang (07.00–21.00) | Malam (21.00–04.00) |
|---|---|---|
| **Critical** | 15 menit | 30 menit |
| **High** | 2 jam | 4 jam |
| **Medium** | 12 jam | 12 jam |
| **Low** | 48 jam | 48 jam |

- SLA malam untuk Critical **hanya sedikit lebih longgar**, bukan dilepas. Peak usage CURHAT DONG justru malam hari (§23) — jam paling sepi moderator adalah jam paling ramai krisis. Konsekuensinya operasional: perlu **rotasi/on-call malam** sejak MVP, bukan setelah insiden pertama.
- Case Critical yang melewati SLA → alert ops otomatis + eskalasi ke Super Admin.
- SLA ini dipantau di admin dashboard sebagai metrik, bukan cuma janji di dokumen.

### 15.4 `[v1.1]` Banding / Appeal Moderasi (gap baru)
v1.0 punya 7 aksi moderasi (approve, remove, warn, mute, suspend, ban, escalate) **tanpa satu pun jalur banding**. Platform yang bisa menghapus konten dan membanned akun wajib punya jalur koreksi — ini soal keadilan sekaligus kewajiban terhadap subjek data (§25.2).

- User yang kena **remove / warn / mute / suspend / ban** mendapat notifikasi berisi: aksi apa, kategori alasan, dan **cara mengajukan banding**.
- **Window banding: 14 hari** sejak aksi (usulan).
- **1 banding per aksi** (usulan) — mencegah spam banding.
- **Reviewer banding ≠ moderator yang memutus.** Kalau tim masih kecil dan tidak ada moderator lain, banding naik ke Super Admin.
- **SLA respons banding: 7 hari** (usulan).
- Hasil: `upheld` (aksi tetap) / `overturned` (aksi dibatalkan + konten/akun dipulihkan) / `reduced` (aksi diperingan). Semua hasil dicatat di audit log dan disampaikan ke user dengan bahasa manusiawi.
- Banding yang `overturned` menjadi sinyal kalibrasi threshold AI moderation — kalau satu kategori sering dibatalkan, thresholdnya yang salah, bukan usernya.
- **Ban akibat Level 3 tidak ada** (§15.1), jadi tidak ada yang perlu dibanding di jalur itu.

### 15.5 `[v1.1]` Safety Level untuk Pesan Private & DONG AI (gap baru)
v1.0 hanya bilang private message dianalisis otomatis, tanpa menetapkan konsekuensinya. Mapping eksplisit:

| Level | Private room (`messages`) | DONG AI (`ai_messages`) |
|---|---|---|
| **L0** | kirim normal | balas normal |
| **L1** | kirim + tandai monitoring | balas + tandai monitoring |
| **L2** | kirim, buat moderation case Medium/High; kalau menyasar lawan bicara (harassment/threat/doxxing) → tampilkan peringatan ke pengirim & tawarkan report/block ke penerima | AI mengarahkan ulang percakapan + tawarkan resources; buat case |
| **L3** | **pesan tetap terkirim**, jalankan SOP §15.1, tawarkan resources ke kedua pihak, aktifkan tombol escalate listener | AI merespons suportif (bukan menolak bicara), tampilkan resources, jalankan SOP §15.1 |

Aturan tegas:
- **Jangan auto-block room atau memutus percakapan di L3.** Orang yang sedang dalam krisis lalu tiba-tiba dibisukan oleh sistem akan merasa ditinggalkan — persis kebalikan dari tujuan produk ini.
- **DONG AI tidak boleh menolak bicara** ("maaf saya tidak bisa membahas ini") saat mendeteksi risiko. Yang benar: tetap hadir, suportif, arahkan ke bantuan manusia/profesional.
- Yang **boleh** diputus otomatis adalah perilaku menyerang orang lain (harassment/threat terarah), bukan penderitaan diri sendiri.
- Klasifikasi safety pesan private berjalan sebagai proses otomatis; akses manusia ke isinya tetap mengikuti aturan §15 (hanya bila dilaporkan/serious safety/legal/authorized debugging, dan seluruh akses di-log).

## 16. Profile, Follow, Topic, Community
- Public profile: alias, avatar, bio, listener status, joined date, helpful reactions. Tanpa email/phone/identitas legal.
- Follow bukan prioritas MVP (kalau ada: istilah "Connect", count bisa disembunyikan).
- Topic awal: Relationship, Marriage, Family, Work, Career, Finance, Friendship, Loneliness, Self Confidence, College, Parenting, Business, Loss, Random, Positive Story. Dikelola admin.
- Community, Voice Note, Voice Room, DONG Point/Credit, Virtual Gift, CURHAT+, Professional Marketplace, B2B = Phase 2–4.

## 17. Monetization & Data Principle
- Potensi: CURHAT+ subscription, AI premium, listener/professional marketplace commission, virtual gifts, voice room economy, B2B.
- Ads bukan model utama; dilarang emotional manipulation / microtargeting dari curhat / target kondisi mental sensitif.
- **User vulnerability is NOT the product** — dilarang bisnis berbasis penjualan curhat personal.

## 18. Admin Panel (MVP)
Dashboard (Total Users, DAU/WAU/MAU, Active Listeners, Curhat/day, AI conversations, Listener sessions, Report Rate, Felt Heard Rate), User management (search, suspend, ban, safety history; akses private content highly restricted + audited), Content management, Moderation queue, AI moderation config (threshold, auto-action, prompt versions + audit trail), Listener management, Category management, Notification CMS (rate controls), Analytics.

## 19. KPI & Target
- Activation: % meaningful action hari pertama (post/reply/AI convo/listener session). Engagement DAU/MAU. Retention D1/D7/D30. Response rate. Median time-to-first-response < 5 menit (arah target). Felt Heard ≥ 60% positive. Report rate rendah. Response coverage 80%.

### 19.1 `[v1.1]` Definisi Operasional Metrik
v1.0 menyebut "meaningful action" tanpa definisi, sehingga Activation tidak bisa dihitung. Definisi berikut dipakai konsisten di analytics dan admin dashboard (semua usulan):

| Metrik | Definisi operasional |
|---|---|
| **Meaningful action** | dalam **24 jam** sejak signup, user melakukan minimal satu dari: (a) publish ≥1 curhat, (b) kirim ≥1 komentar/balasan, (c) percakapan DONG AI dengan ≥4 pesan user, (d) menyelesaikan ≥1 sesi listener (sebagai pihak mana pun). Reaction saja **tidak** dihitung — terlalu murah untuk menandakan keterlibatan. |
| **Activation Rate** | % user baru yang mencapai meaningful action |
| **Felt Heard Rate** | `(jawaban "Iya" + "Sedikit") / total prompt terjawab`. Prompt yang di-dismiss **tidak** masuk penyebut (§9). |
| **Response Rate** | % post yang dapat ≥1 respons manusia dalam 24 jam |
| **Response Coverage** | % post yang dapat ≥1 respons manusia (tanpa batas waktu) |
| **Time-to-first-response** | median selisih waktu publish → respons manusia pertama (komentar/reaksi tidak dihitung) |
| **Report Rate** | laporan per 1.000 konten yang dipublikasikan |

Catatan: Felt Heard Rate adalah North Star, jadi definisinya tidak boleh diubah diam-diam. Perubahan rumus wajib dicatat di changelog dokumen ini agar tren historis tetap bisa dibaca.

## 20. Data & Architecture (arahan PRD)
- **Emotional Graph** internal (emotion, topic, interaction pattern, listener compatibility) — tidak untuk iklan sensitif.
- **Recommendation signals**: emotional relevance, topic, language, freshness, unanswered, safety, previous positive interaction, Felt Heard. Penalty: toxicity, rage bait, spam, sensationalism.
- **Core entities**: users, user_profiles, anonymous_identities, auth_accounts, user_devices, user_sessions; curhat_posts, post_categories, post_tags, comments, comment_replies, reactions; moods, mood_entries, felt_heard_feedback; listener_profiles, listener_availability, listener_topics, listener_matches, listener_sessions; chat_rooms, room_members, messages, message_reactions; ai_conversations, ai_messages, ai_classifications; safety_events, reports, moderation_cases, moderation_actions, blocked_users, trust_scores; journals, journal_entries; subscriptions, payments, virtual_credits, gift_transactions; notifications, feature_flags, app_configs, audit_logs.
- **Privacy architecture**: pisahkan Identity Data vs Social Content Data via internal user ID. Client tidak boleh terima email/auth provider ID/phone/risk score.
- **Security minimum**: TLS, encryption at rest, passwordless auth aman, rotating/refresh tokens, rate limiting, bot protection, RBAC, admin MFA, audit log, secret management, input sanitization, file validation.
- **Tech (proposed)**: Monorepo (`apps/web|mobile|admin|api`, `packages/ui|database|auth|ai|moderation|realtime|analytics|config|types`). Web Next.js/TS, Mobile React Native (APK+AAB), Backend Node/TS (NestJS), PostgreSQL, Redis, WebSocket, S3-compatible storage, FCM, **LLM abstraction layer / AI Gateway** (multi-provider, model routing murah↔advanced), observability, feature flags.

## 21. MVP — Phase 1
**Goal:** membuktikan "apakah orang mau curhat dan kembali karena merasa didengar?"
**Deliverables:** Web app, Android APK, Admin panel — semuanya production ready.
**Fitur MVP:**
- Account: Email OTP, Google Login, Age Gate, Anonymous Profile.
- Social: Home Feed, Create Curhat, Categories, Mood, Comments, Replies, Emotional Reactions, Report, Block.
- AI: DONG AI, emotion detection, intent detection, AI moderation, safety escalation.
- Listener: Listener Mode, availability, matching, private text room, session feedback.
- Emotional: Felt Heard Feedback.
- Platform: Push notification, Search, Settings, Delete account.
- Admin: user mgmt, post mgmt, reports, moderation, safety queue, categories, analytics, push.
**Core loop:** Open → See Curhat → Read/Respond → Create Own → Receive Response → Feel Heard → Return. Secondary: Need Someone → Request Listener → Matched → Private Curhat → Feel Heard → Become Listener.
**Out of scope Phase 1:** professional marketplace, paid listener, live audio, livestream, video call, virtual gift, creator economy, B2B, marketplace, iOS launch, advanced communities.

## 22. Phase 2–4 (ringkas)
P2: CURHAT+, advanced AI, journal, mood history, voice note, community, advanced matching, emotional graph persisten. P3: verified/premium listener, points/credit/gift, voice room, revenue share. P4: professional marketplace, B2B, ekspansi regional (ID/MY/PH/SG/TH), multi-language.

## 23. Non-Functional
- Scalable horizontal; MVP modular monolith (belum microservices).
- Performance: API p95 < 500ms, chat delivery < 2s, first useful feed 2–3s, availability 99.5%+.
- UX: dark-friendly (usage malam), calming/warm/private/safe; hindari nuansa rumah sakit/klinik/dating/crypto/korporat.
- Navigasi mobile: HOME, EXPLORE, + CURHAT (floating), LISTEN, PROFILE. Private AI entry di Home. Midnight Mode (copy berubah malam hari).
- Cold start: Seed Listener Network; feed "Butuh Didengar" prioritaskan zero-reply/recent; push listener nudge.
- **Definisi selesai MVP**: user bisa buat akun anonim → cerita → dapat respons manusia → ngobrol DONG AI → minta listener → private conversation → bilang "Gue merasa didengar" — semuanya aman via Web & Android APK.

### 23.1 `[v1.1]` Aksesibilitas (gap baru — belum disebut di v1.0)
Produk ini menyasar orang yang sedang lelah, cemas, atau kesulitan — banyak di antaranya membuka app tengah malam dengan mata capek. Aksesibilitas di sini bukan checklist kepatuhan, tapi bagian dari "calming & safe".

Target MVP:
- **Kontras WCAG 2.1 AA**: 4.5:1 untuk teks normal, 3:1 untuk teks besar & elemen UI — berlaku di dark **dan** light mode, termasuk Midnight Mode.
- **Font scaling OS** dihormati sampai minimal 200%; layout tidak boleh pecah atau memotong teks.
- **Screen reader label** untuk seluruh ikon bermakna: 11 mood, 6 reaction, 4 intent, dan ikon kategori. Ikon-ikon ini membawa makna emosional inti produk — tanpa label, seluruh interaksi utama tidak terbaca.
- **Jangan menyampaikan makna hanya lewat warna.** Mood dan safety state harus punya label teks atau bentuk pembeda.
- **Touch target ≥ 44×44 px**.
- **Focus visible** dan navigasi keyboard penuh di web/admin.
- **Hormati `prefers-reduced-motion`** — animasi lembut adalah brand principle, tapi tetap bisa dimatikan.
- Copy tetap non-klinis dan mudah dibaca; hindari kalimat panjang bertingkat di layar krisis (§15.1) — di sana justru kejelasan yang paling penting.

## 24. Catatan Review (tambahan hasil review, wajib masuk tasking)
1. Compliance: pendaftaran **PSE Kominfo** + kepatuhan **UU PDP 27/2022** (curhat = data pribadi sensitif; privacy policy, consent, retention).
2. Crisis protocol Level 3: SOP konkret + daftar hotline Indonesia valid + SLA moderasi (peak malam hari).
3. Listener safety: guidelines wajib sebelum aktivasi, tombol escalate di room, batasan "listener bukan konselor", perlindungan burnout listener.
4. AI cost guard: rate limit AI per user/hari sejak MVP, cost monitoring + budget alert, model routing.
5. Domain konsisten: curhatdong.com / api.curhatdong.com / admin.curhatdong.com.
6. Push notification tidak menampilkan isi curhat/chat.

> `[v1.1]` Keenam catatan di atas sudah diturunkan menjadi requirement: (1) → §25.1–25.2, (2) → §15.1–15.3, (3) → §11.1–11.3, (4) → §10 AI Cost Guard, (5) → sudah konsisten di seluruh dokumen, (6) → §14 + Tech Spec §6.2.

---

## 25. `[v1.1]` Compliance, Privasi & Data Lifecycle

Bagian ini menutup §24.1 dan mengisi lubang yang tidak pernah dibahas v1.0. Prinsip dasarnya satu:

> Curhat adalah data pribadi yang bersifat spesifik. Perlakukan seperti catatan paling privat seseorang, bukan seperti konten media sosial.

### 25.1 Pendaftaran PSE
- Layanan ini termasuk **Penyelenggara Sistem Elektronik (PSE) Lingkup Privat** dan wajib terdaftar sebelum beroperasi untuk publik Indonesia.
- **Blocker rilis**: pendaftaran harus selesai sebelum go-live publik, bukan sesudah. Risiko kalau dilanggar: teguran hingga pemutusan akses layanan.
- Perlu ditetapkan sebelum pendaftaran: badan hukum/penanggung jawab, alamat, kontak resmi, deskripsi layanan, kategori data yang diproses, dan URL Privacy Policy + ToS yang **sudah tayang**.
- `⚠️ ACTION REQUIRED:` nama kementerian dan alur pendaftaran PSE pernah berubah (Kominfo → Kementerian Komunikasi dan Digital). Prosedur, portal, dan persyaratan terbaru wajib diverifikasi langsung ke sumber resmi saat akan mendaftar — jangan mengandalkan dokumen ini atau tutorial lama.

### 25.2 UU PDP No. 27 Tahun 2022
Isi curhat, mood, riwayat percakapan AI, dan percakapan private room berpotensi mengungkap **data kesehatan dan kondisi psikologis** — kategori data pribadi yang spesifik, sehingga standar perlindungannya lebih tinggi daripada data biasa.

**Dasar pemrosesan:** persetujuan (consent) yang eksplisit, spesifik, dan dapat ditarik. Bukan implied consent, bukan bundled.

**Hak subjek data yang wajib difasilitasi:**

| Hak | Implementasi di produk |
|---|---|
| Akses & salinan data | Settings → Download data (§16 v1.0) |
| Koreksi | edit profil/alias; konten sendiri bisa dihapus |
| Penghapusan | Delete Account (hapus vs anonymize) + hapus post sendiri |
| Penarikan consent | Settings → cabut consent analitik; cabut consent = berhenti diproses ke depan |
| Keberatan atas pemrosesan | jalur kontak + banding (§15.4) |
| Portabilitas | export data dalam format terstruktur (JSON) |

**Notifikasi kebocoran data:** UU PDP mewajibkan pemberitahuan tertulis dalam **3×24 jam** kepada subjek data dan lembaga berwenang. Konsekuensi produk: harus ada **SOP breach tertulis + kontak PIC + template notifikasi** sebelum go-live — 3×24 jam terlalu pendek untuk mulai memikirkan caranya saat insiden terjadi.

**Konsekuensi arsitektur** (menegaskan §20):
- pisahkan identity data (email, provider ID) dari social content;
- enkripsi data identitas at rest, hash untuk lookup;
- akses admin ke konten privat hanya lewat workflow resmi + audit log;
- minimisasi data — jangan kumpulkan yang tidak dipakai.

`⚠️ ACTION REQUIRED:` penunjukan/kebutuhan Pejabat Pelindungan Data Pribadi (DPO) dan kewajiban turunan lain perlu dikonfirmasi ke penasihat hukum. Dokumen ini tidak menggantikan nasihat hukum.

### 25.3 Consent Flow (gap baru)
v1.0 hanya punya langkah "safety rules" di onboarding. Itu tidak cukup sebagai dasar pemrosesan.

Consent dipecah menjadi tiga, **tercatat terpisah** (jenis, versi dokumen, timestamp, dan cara pemberian):

| # | Consent | Sifat | Isi |
|---|---|---|---|
| 1 | **ToS + Privacy Policy** | wajib | syarat layanan & kebijakan privasi |
| 2 | **Pemrosesan data spesifik** | wajib | isi curhat/mood/percakapan dianalisis otomatis untuk keamanan & pencocokan; dijelaskan dengan bahasa manusia, bukan pasal |
| 3 | **Analitik & product improvement** | **opsional** | wajib bisa ditolak tanpa kehilangan akses ke fitur inti |

Aturan:
- **Dilarang bundling** — satu checkbox untuk semuanya membuat consent tidak sah.
- **Dilarang pre-checked.**
- Aturan komunitas (safety rules) tetap ada sebagai langkah acknowledge terpisah — itu kesepakatan perilaku, bukan consent data.
- Perubahan materiil pada Privacy Policy → minta consent ulang untuk versi baru.
- Consent bisa dicabut dari Settings kapan saja; pencabutan consent #3 tidak boleh mengurangi fungsi apa pun.
- Riwayat consent disimpan untuk pembuktian kepatuhan.

### 25.4 Retention & Deletion Policy (gap baru)
v1.0 hanya menyebut "hapus konten vs anonymize" tanpa durasi apa pun. Semua nilai berikut **usulan**:

| Data | Retensi | Rasional |
|---|---|---|
| `curhat_posts`, `comments` | selama akun aktif; **30 hari grace** setelah delete account | grace period untuk penyesalan & pemulihan akun yang di-hack |
| `messages` (private room) | **12 bulan** sejak sesi berakhir | cukup untuk investigasi laporan; tidak jadi arsip percakapan intim seumur hidup |
| `ai_messages` | **6 bulan** | konteks percakapan tidak lagi relevan setelahnya |
| `ai_classifications`, `safety_events` | **24 bulan** | pola pelanggaran berulang perlu jendela panjang |
| `moderation_cases`, `moderation_actions`, `audit_logs` | **24 bulan** | kebutuhan investigasi & pembuktian kepatuhan |
| `reports` | **24 bulan** | mengikuti moderation case |
| `otp_challenges` | **24 jam** | tidak ada alasan menyimpan lebih lama |
| `user_sessions` (revoked) | **90 hari** | forensik keamanan akun |
| `user_devices` (tidak aktif) | **180 hari** | push token basi tidak berguna |
| Backup database | **30 hari** rolling | sesuai Tech Spec §7.6 |
| Data analitik teragregasi | tanpa batas, **wajib non-identifiable** | tren produk tidak butuh identitas |

Aturan:
- Retensi dijalankan sebagai **job terjadwal**, bukan dibersihkan manual sesekali.
- **Delete Account** menawarkan dua pilihan (§16 v1.0), dijelaskan jujur ke user:
  - *Hapus konten* — post, komentar, pesan AI dihapus; jejak moderasi & audit log tetap ada selama masa retensi (kewajiban kepatuhan, tidak berisi konten).
  - *Anonymize* — konten tetap ada tanpa kaitan ke akun; **tidak dapat dibatalkan** dan tidak bisa dihapus belakangan karena kaitannya sudah putus. Konsekuensi ini wajib dinyatakan sebelum konfirmasi.
- Penghapusan dari **backup** tidak instan — backup lama baru hilang saat rotasi 30 hari selesai. Katakan apa adanya di Privacy Policy; jangan menjanjikan "terhapus seketika dari semua sistem".
- Pesan di private room dimiliki bersama dua pihak: menghapus akun **tidak** menghapus salinan percakapan milik lawan bicara sebelum masa retensi habis. Ini harus dijelaskan di layar delete account.

### 25.5 Age Gate — Batas yang Jujur (gap baru)
v1.0 mewajibkan konfirmasi 18+, tapi tidak membahas apa yang terjadi setelahnya.
- MVP memakai **self-declaration** (tanggal lahir/konfirmasi), bukan verifikasi identitas. Ini pilihan sadar: meminta KTP ke platform anonim akan menghancurkan premis produknya sendiri.
- Deklarasi + timestamp **dicatat**.
- Ditolak (<18) → layar ramah, tanpa menyalahkan, dengan saran alternatif bantuan. Jangan biarkan mereka langsung mencoba lagi dengan tanggal berbeda (usulan: cooldown pada device/browser).
- Kalau kemudian ada indikasi kuat user di bawah umur (laporan, konten), moderator dapat menangguhkan akun — masuk queue moderasi biasa, dan **bisa dibanding** (§15.4).
- **Jangan mengklaim ke publik bahwa platform ini terverifikasi 18+.** Yang benar: "ditujukan untuk 18+".

### 25.6 Akses Manusia ke Konten Privat
Menegaskan dan memperketat §15 v1.0:
- akses hanya dengan **case aktif** (laporan, safety serius, kewajiban hukum, atau debugging berwenang);
- setiap akses **wajib** menghasilkan `audit_logs` (siapa, kapan, case mana, data apa);
- admin melihat banner "akses ini dicatat" sebelum membuka konten;
- akses tanpa case adalah pelanggaran internal, bukan sekadar kebiasaan buruk;
- log akses ditinjau berkala (usulan: bulanan).

### 25.7 Rekap Nilai Usulan — Perlu Sign-off
Seluruh angka `(usulan)` di v1.1, dikumpulkan agar mudah ditinjau sekaligus:

| Ref | Item | Usulan |
|---|---|---|
| §9 | Felt Heard: per post / per hari / delay | 1× / 3× / 30 menit |
| §10 | Kuota AI per user per hari | 50 pesan (25 saat degradasi) |
| §10 | Ambang alert budget AI | 70% & 90% |
| §11.2 | Listener: konkuren / per hari / cooldown | 3 / 8 / 10 menit |
| §11.2 | Reminder istirahat listener | 3 sesi berturut atau 90 menit |
| §14 | Quiet hours push | 22.00–07.00 lokal |
| §15.2 | Re-verifikasi hotline | tiap 3 bulan |
| §15.3 | SLA Critical siang / malam | 15 / 30 menit |
| §15.3 | SLA High / Medium / Low | 2 jam / 12 jam / 48 jam |
| §15.4 | Banding: window / kuota / SLA | 14 hari / 1× per aksi / 7 hari |
| §19.1 | Meaningful action | ≥1 post, ≥1 komentar, ≥4 pesan AI, atau 1 sesi listener dalam 24 jam |
| §25.4 | Retensi | lihat tabel §25.4 |
| §25.6 | Tinjauan log akses | bulanan |

**Item yang butuh keputusan/verifikasi di luar dokumen ini:**
1. Daftar hotline Indonesia yang valid (§15.2) — **blocker rilis**.
2. Prosedur & portal pendaftaran PSE terkini (§25.1) — **blocker rilis**.
3. Badan hukum, penanggung jawab, dan kebutuhan DPO (§25.1–25.2).
4. Naskah Privacy Policy, ToS, dan Community Guidelines (butuh review hukum).
5. Kesanggupan **rotasi moderator malam** untuk memenuhi SLA Critical (§15.3) — kalau tidak sanggup, SLA-nya yang harus direvisi, bukan diabaikan diam-diam.

---

## CHANGELOG

### v1.1 — 12 Agustus 2026

**Ditambahkan (gap yang belum pernah dibahas v1.0)**
- §11.1–11.3 Listener Guidelines, perlindungan burnout, escalation path
- §15.4 Banding / appeal moderasi
- §15.5 Safety level untuk pesan private & DONG AI
- §19.1 Definisi operasional metrik (termasuk "meaningful action")
- §23.1 Aksesibilitas
- §25 Compliance, Privasi & Data Lifecycle (PSE, UU PDP, consent flow, retention, age gate, akses konten privat)
- §25.7 Rekap nilai usulan untuk sign-off
- §9 Anti-fatigue Felt Heard
- §14 Quiet hours push
- §11 Cakupan bahasa MVP

**Diperjelas (sebelumnya hanya catatan satu baris di §24)**
- §10 AI Cost Guard — kuota, budget alert, degradasi, dan larangan mendegradasi klasifikasi safety
- §15.1 SOP Crisis Level 3 — kini berlaku untuk post, komentar, DONG AI, dan private room
- §15.2 Struktur konfigurasi hotline (tanpa mencantumkan nomor yang belum diverifikasi)
- §15.3 SLA moderasi per queue, dengan pembedaan jam malam
- §5 Consent dipisah dari safety rules

**Tidak diubah**
- Struktur dan penomoran §1–24
- Seluruh keputusan produk inti: positioning, North Star, MVP scope, roadmap Phase 2–4
