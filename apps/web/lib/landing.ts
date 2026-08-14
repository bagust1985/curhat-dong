import type { Intent, Mood } from './vocabulary';

/**
 * Landing page content — E15-T05. DESIGN-REF §2.1, PRD §13.
 *
 * Everything the landing page says lives here as data, for one reason: this is
 * the only page of the product a stranger sees before deciding to trust it, and
 * the only page that is allowed to be indexed. Copy that is reachable as data
 * can be tested; copy scattered through JSX cannot.
 *
 * The preview feed below is written by us. It is NOT sampled from the real feed,
 * and the landing page makes no request to the API at all — see
 * `components/landing.test.tsx`. A curated preview is a marketing decision;
 * putting somebody's actual curhat on a public, indexable, un-authenticated page
 * would be a privacy incident regardless of how anonymous it looked.
 */

/** Hero copy — Revisi 2, straight from the brand mock (docs/contoh web.png). */
export const HERO = {
  title: 'Ada tempat buat cerita.',
  subtitle:
    'Curhat dong, kapan pun kamu butuh didengar. Di sini, kamu nggak sendiri.',
  primaryCta: 'Mulai Curhat',
  secondaryCta: 'Pelajari Fitur',
} as const;

export interface NavLink {
  label: string;
  href: string;
}

/**
 * Top navbar — Revisi 2.
 *
 * The mock lists Beranda · Fitur · Tentang · Blog. Blog is deliberately
 * omitted: no blog exists, and a dead link on the one page strangers use to
 * decide whether to trust the product is the opposite of what this page is
 * for. Fitur and Tentang are same-page sections, which is all a one-page
 * product needs.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Beranda', href: '#beranda' },
  { label: 'Fitur', href: '#fitur' },
  { label: 'Tentang', href: '#tentang' },
];

export interface Feature {
  /** Decorative — always paired with the visible title, never the only signal. */
  glyph: string;
  title: string;
  body: string;
  /**
   * Tint token for the glyph plate (E18-T01). Assigned by meaning, not by
   * position: lavender is DONG AI's colour everywhere in the product, so the
   * AI feature carries it here too. A stranger who signs up meets the same
   * colour again on the AI screen.
   */
  tint: string;
}

/**
 * The four-feature row from the mock. Copy verbatim from the brand kit;
 * "Komunitas" describes sharing and responding, which exists today — the
 * dedicated Communities feature is Phase 2 and deliberately not promised here.
 */
export const FEATURES: readonly Feature[] = [
  {
    glyph: '🔒',
    title: 'Privasi Aman',
    body: 'Cerita kamu dijaga kerahasiaannya.',
    tint: 'var(--color-tint-rose)',
  },
  {
    glyph: '💜',
    title: 'Didengar AI',
    body: 'AI siap mendengar dan memahami.',
    tint: 'var(--color-tint-lavender)',
  },
  {
    glyph: '😊',
    title: 'Nyaman & Aman',
    body: 'Lingkungan positif tanpa penilaian.',
    tint: 'var(--color-tint-pink)',
  },
  {
    glyph: '👥',
    title: 'Komunitas',
    body: 'Kamu bisa berbagi dan terhubung.',
    tint: 'var(--color-tint-amber)',
  },
];

export interface ValueProp {
  /** Decorative — always paired with the visible title, never the only signal. */
  glyph: string;
  title: string;
  body: string;
  /** Tint token for the glyph plate. Same rule as `Feature.tint`. */
  tint: string;
}

/** DESIGN-REF §2.1: anonim, listener manusia, DONG AI, aman. */
export const VALUE_PROPS: readonly ValueProp[] = [
  {
    glyph: '🫥',
    title: 'Anonim kalau kamu mau',
    body: 'Kamu dapat nama samaran otomatis. Tiap curhat anonim pakai kode yang beda, jadi cerita-ceritamu nggak bisa disambung-sambungin jadi satu orang.',
    tint: 'var(--color-tint-rose)',
  },
  {
    glyph: '🤍',
    title: 'Didengar manusia beneran',
    body: 'Listener di sini belajar buat dengerin, bukan ngasih ceramah. Kamu yang nentuin kapan mau cerita dan kapan mau berhenti.',
    tint: 'var(--color-tint-pink)',
  },
  {
    glyph: '🌙',
    title: 'DONG AI nemenin jam 2 pagi',
    body: 'Kalau lagi nggak ada siapa-siapa, DONG siap nemenin ngobrol. DONG itu AI — bukan psikolog, dan nggak akan pura-pura jadi psikolog.',
    tint: 'var(--color-tint-lavender)',
  },
  {
    glyph: '🛡️',
    title: 'Dijaga, bukan dihakimi',
    body: 'Ada sistem keamanan otomatis dan tim moderasi. Kalau kami lihat tanda kamu lagi nggak aman, yang muncul adalah bantuan — bukan hukuman.',
    tint: 'var(--color-tint-amber)',
  },
];

/**
 * Two lines the landing page is not allowed to lose, no matter how the design
 * changes: this is an 18+ product (PRD §25.4) and it is not an emergency
 * service (PRD §15).
 *
 * No hotline numbers appear here on purpose. The verified Indonesian list is
 * still outstanding (E17-T12) and a wrong number on the one public page of a
 * mental-health product is worse than no number at all.
 */
export const HONESTY_NOTES: readonly string[] = [
  'CURHAT DONG untuk 18 tahun ke atas.',
  'Ini bukan layanan darurat dan bukan pengganti bantuan profesional. Kalau kamu dalam bahaya sekarang, hubungi layanan darurat di sekitarmu.',
];

export interface PreviewCurhat {
  id: string;
  title: string;
  excerpt: string;
  mood: Mood;
  intent: Intent;
  categoryName: string;
  authorLabel: string;
  isAnonymous: boolean;
  replyCount: number;
  createdAtLabel: string;
  variant: 'default' | 'butuh-didengar' | 'anonymous';
}

/**
 * Curated preview — written for this page, not taken from the feed.
 *
 * Deliberately ordinary problems. A preview full of crisis-level content would
 * both misrepresent the feed and act as an invitation to post at that intensity
 * on a public page.
 */
export const PREVIEW_CURHAT: readonly PreviewCurhat[] = [
  {
    id: 'contoh-1',
    title: 'Capek pura-pura baik-baik aja di kantor',
    excerpt:
      'Tiap ditanya "gimana kabarnya?" jawabannya selalu "baik". Padahal udah dua minggu ini bangun tidur rasanya berat banget.',
    mood: 'capek',
    intent: 'cuma_didengar',
    categoryName: 'Kerjaan',
    authorLabel: 'Anonim #4821',
    isAnonymous: true,
    replyCount: 12,
    createdAtLabel: 'Contoh',
    variant: 'default',
  },
  {
    id: 'contoh-2',
    title: 'Baru putus dan rumah jadi kerasa sepi',
    excerpt:
      'Bukan mau balikan, cuma belum kebiasa aja. Biasanya ada yang nanya udah makan belum.',
    mood: 'patah_hati',
    intent: 'butuh_dukungan',
    categoryName: 'Hubungan',
    authorLabel: 'senja.tenang',
    isAnonymous: false,
    replyCount: 0,
    createdAtLabel: 'Contoh',
    variant: 'butuh-didengar',
  },
  {
    id: 'contoh-3',
    title: 'Overthinking soal masa depan tiap malem',
    excerpt:
      'Siang masih bisa sibuk. Begitu lampu dimatiin, kepala langsung muter mikirin lima tahun lagi aku jadi apa.',
    mood: 'overthinking',
    intent: 'pernah_ngalamin',
    categoryName: 'Diri Sendiri',
    authorLabel: 'Anonim #1903',
    isAnonymous: true,
    replyCount: 4,
    createdAtLabel: 'Contoh',
    variant: 'anonymous',
  },
];

export interface LegalLink {
  label: string;
  href: string;
}

/**
 * Footer links — DESIGN-REF §2.1.
 *
 * The three documents are placeholders until E17-T10 lands them with legal
 * review; the routes exist so the footer never points at a 404, and they stay
 * noindex until there is real text behind them.
 */
export const LEGAL_LINKS: readonly LegalLink[] = [
  { label: 'Kebijakan Privasi', href: '/legal/privacy' },
  { label: 'Syarat & Ketentuan', href: '/legal/terms' },
  { label: 'Panduan Komunitas', href: '/legal/guidelines' },
  { label: 'Kontak', href: 'mailto:halo@curhatdong.com' },
];

/**
 * The Android build URL, or `null` when there is nothing to download yet.
 *
 * Read through an explicit `process.env.NEXT_PUBLIC_*` access rather than a
 * lookup, because Next inlines these at build time only when they are written
 * out literally. `null` is a real state: before the first APK ships, the CTA has
 * to say so instead of linking somewhere broken.
 */
export function androidApkUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_ANDROID_APK_URL;
  return url && url.length > 0 ? url : null;
}

/**
 * The only routes allowed to be indexed (PRD §13, CLAUDE.md non-negotiable #5).
 *
 * Kept as a list so `robots.ts`, `sitemap.ts` and the SEO test all read the same
 * source. Legal pages join this list in E17-T10, once they contain the reviewed
 * documents rather than a placeholder.
 */
export const INDEXABLE_ROUTES: readonly string[] = ['/'];
