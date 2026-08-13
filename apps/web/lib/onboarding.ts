/**
 * Onboarding content and rules — E15-T07. DESIGN-REF §2.3, PRD §5, §25.3.
 *
 * The consent definitions live here as data because two of the acceptance
 * criteria are properties of the *set*: nothing pre-checked, and the continue
 * button stays off until both required items are ticked. Written as a list,
 * both can be asserted; written as JSX, only the current rendering can.
 */

export type ConsentType = 'tos_privacy' | 'sensitive_processing' | 'analytics';

export interface ConsentItem {
  type: ConsentType;
  title: string;
  /** Plain Indonesian. A consent nobody understands is not consent. */
  body: string;
  required: boolean;
  /** Shown for the optional one, so refusing does not feel like breaking it. */
  refusalNote?: string;
  links?: Array<{ label: string; href: string }>;
}

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  {
    type: 'tos_privacy',
    title: 'Syarat & Ketentuan dan Kebijakan Privasi',
    body: 'Aku sudah baca dan setuju dengan aturan main dan cara CURHAT DONG memperlakukan data aku.',
    required: true,
    links: [
      { label: 'Baca Syarat & Ketentuan', href: '/legal/terms' },
      { label: 'Baca Kebijakan Privasi', href: '/legal/privacy' },
    ],
  },
  {
    type: 'sensitive_processing',
    title: 'Pemrosesan isi curhat',
    body: 'Isi curhat kamu dibaca sistem otomatis untuk menjaga keamanan dan mencocokkan kamu dengan orang yang tepat.',
    required: true,
  },
  {
    type: 'analytics',
    title: 'Analitik & pengembangan produk',
    body: 'Data pemakaian yang nggak nunjuk ke kamu dipakai buat memperbaiki aplikasi.',
    required: false,
    refusalNote: 'Boleh nggak diaktifin, semua fitur tetap jalan.',
  },
];

export const REQUIRED_CONSENTS: readonly ConsentType[] = CONSENT_ITEMS.filter(
  (item) => item.required,
).map((item) => item.type);

/** True only when every required consent is granted (DESIGN-REF §2.3 step 5). */
export function consentSatisfied(granted: Partial<Record<ConsentType, boolean>>): boolean {
  return REQUIRED_CONSENTS.every((type) => granted[type] === true);
}

export interface ReasonOption {
  value: 'cerita' | 'mendengarkan' | 'keduanya' | 'lihat_lihat';
  label: string;
}

export const REASON_OPTIONS: readonly ReasonOption[] = [
  { value: 'cerita', label: 'Mau cerita' },
  { value: 'mendengarkan', label: 'Mau mendengarkan' },
  { value: 'keduanya', label: 'Keduanya' },
  { value: 'lihat_lihat', label: 'Cuma lihat-lihat dulu' },
];

/**
 * Behaviour rules — step 6.
 *
 * Kept separate from consent on purpose (DESIGN-REF §2.3): agreeing to how you
 * will treat other people is not the same act as permitting us to process your
 * data, and bundling them would make both weaker.
 */
export const SAFETY_RULES: readonly string[] = [
  'Cerita orang lain bukan bahan obrolan di luar. Jangan di-screenshot, jangan disebar.',
  'Jangan bagikan identitas siapa pun — termasuk identitasmu sendiri. Nama lengkap, alamat, nomor, akun medsos.',
  'Nggak ada yang perlu diceramahi. Kalau nggak tahu mau bilang apa, "aku dengerin" udah cukup.',
  'Ada tim moderasi dan sistem keamanan otomatis. Kalau ada tanda seseorang lagi nggak aman, kami tampilkan bantuan.',
  'Ini bukan layanan darurat. Kalau ada bahaya sekarang, hubungi layanan darurat di sekitarmu.',
];

export const STEP_TITLES: readonly string[] = [
  'Selamat datang',
  'Kamu ke sini buat apa?',
  'Topik yang dekat sama kamu',
  'Nama samaran kamu',
  'Persetujuan',
  'Aturan main',
  'Selesai',
];

/** Steps the user may pass without answering (DESIGN-REF §2.3). */
export const SKIPPABLE_STEPS: readonly number[] = [1, 2];

export const AVATAR_PRESETS: readonly { id: string; glyph: string; label: string }[] = [
  { id: 'bulan', glyph: '🌙', label: 'Bulan' },
  { id: 'awan', glyph: '☁️', label: 'Awan' },
  { id: 'kopi', glyph: '☕', label: 'Kopi' },
  { id: 'tanaman', glyph: '🪴', label: 'Tanaman' },
  { id: 'kucing', glyph: '🐈', label: 'Kucing' },
  { id: 'ombak', glyph: '🌊', label: 'Ombak' },
  { id: 'bintang', glyph: '✨', label: 'Bintang' },
  { id: 'hujan', glyph: '🌧️', label: 'Hujan' },
];

export const WELCOME_COPY = 'Di sini kamu nggak harus terlihat baik-baik saja.';
