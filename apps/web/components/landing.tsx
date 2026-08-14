import { CurhatCard } from './curhat-card';
import { Button } from './ui';
import {
  FEATURES,
  HERO,
  HONESTY_NOTES,
  LEGAL_LINKS,
  NAV_LINKS,
  PREVIEW_CURHAT,
  VALUE_PROPS,
  androidApkUrl,
} from '../lib/landing';

/**
 * Landing page sections — E15-T05, rebuilt to the brand mock in Revisi 2
 * (docs/contoh web.png): pill navbar, two-column hero with the mascot, wavy
 * divider, four-feature row. DESIGN-REF §2.1.
 *
 * Server components on purpose: this page has no state, no interactivity beyond
 * links, and — most importantly — no data fetching. Someone arriving here has
 * not consented to anything yet, so the page ships as static HTML and reads
 * nothing about them.
 *
 * Colours come from the theme tokens only, so the page follows Midnight Mode
 * automatically (E15-T01 + `ThemeScript`) instead of needing a variant of its
 * own.
 */

/** The wordmark, rebuilt in HTML: crisp at any size and theme-aware —
 * "curhat" in ink, "dong" on the brand's pink pill (dark ink on pink; white
 * on pink fails AA and is a tested rule). */
function Wordmark() {
  return (
    <span className="inline-flex items-baseline gap-1 text-xl font-extrabold lowercase">
      <span className="text-[var(--color-text)]">curhat</span>
      <span className="rounded-[var(--radius-chip)] bg-[var(--color-brand)] px-2 py-0.5 text-base text-[var(--color-accent-fg)]">
        dong
      </span>
    </span>
  );
}

export function LandingNavbar() {
  const apkUrl = androidApkUrl();

  return (
    <nav
      aria-label="Navigasi landing"
      className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-[var(--radius-chip)] bg-[var(--color-surface)] px-5 py-3 shadow-sm"
    >
      <a href="#beranda" className="flex min-h-[var(--size-touch)] items-center gap-2">
        {/* Decorative next to the wordmark, which carries the name. */}
        <img src="/brand/mascot.png" alt="" width={36} height={28} />
        <Wordmark />
      </a>

      <ul className="flex flex-wrap items-center gap-1">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-flex min-h-[var(--size-touch)] items-center rounded-[var(--radius-chip)] px-4 text-sm font-semibold text-[var(--color-text)]"
            >
              {link.label}
            </a>
          </li>
        ))}
        {apkUrl ? (
          <li>
            <Button href={apkUrl} className="text-sm">
              Unduh Aplikasi
            </Button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

export function LandingHero() {
  const apkUrl = androidApkUrl();

  return (
    <section id="beranda" className="mx-auto mt-6 max-w-5xl">
      <div className="grid items-center gap-8 rounded-[2rem] bg-[var(--color-surface-alt)] px-8 pt-12 pb-0 sm:grid-cols-[3fr_2fr] sm:px-12">
        <div className="pb-12 text-center sm:text-left">
          <h1 className="text-4xl leading-tight font-extrabold text-balance text-[var(--color-text)] sm:text-5xl">
            {HERO.title}
          </h1>

          <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--color-muted)] max-sm:mx-auto">
            {HERO.subtitle}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button href="/auth" className="w-full max-w-xs sm:w-auto">
              {HERO.primaryCta}
            </Button>
            <Button href="#fitur" variant="secondary" className="w-full max-w-xs sm:w-auto">
              {HERO.secondaryCta}
            </Button>
          </div>

          {!apkUrl ? (
            // No build to link to yet. Saying so is better than a dead link or
            // a button that does nothing when tapped (the navbar shows the
            // download pill only once a real APK URL exists).
            <p className="mt-6 max-w-xs text-sm text-[var(--color-muted)] max-sm:mx-auto">
              Aplikasi Android lagi disiapkan. Sementara ini bisa dibuka lewat browser.
            </p>
          ) : null}
        </div>

        <div className="flex items-end justify-center self-end">
          {/* Decorative: the headline next to it says everything it means. */}
          <img
            src="/brand/mascot.png"
            alt=""
            width={297}
            height={232}
            className="h-auto w-56 max-w-full sm:w-72"
          />
        </div>
      </div>

      {/* The mock's wavy transition out of the lavender hero. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 64"
        preserveAspectRatio="none"
        className="-mt-px block h-10 w-full"
      >
        <path
          d="M0,0 C240,64 480,64 720,32 C960,0 1200,0 1440,32 L1440,64 L0,64 Z"
          fill="var(--color-bg)"
        />
      </svg>
    </section>
  );
}

export function LandingFeatures() {
  return (
    <section aria-labelledby="fitur-heading" id="fitur" className="px-[var(--spacing-gutter)] py-12">
      <h2 id="fitur-heading" className="sr-only">
        Fitur
      </h2>

      <ul className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <span
              aria-hidden="true"
              className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--color-brand)] text-2xl"
            >
              {feature.glyph}
            </span>
            <h3 className="mt-4 text-base font-bold text-[var(--color-text)]">{feature.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LandingValueProps() {
  return (
    <section aria-labelledby="kenapa-di-sini" id="tentang" className="px-[var(--spacing-gutter)] py-12">
      <h2
        id="kenapa-di-sini"
        className="text-center text-2xl font-bold text-[var(--color-text)]"
      >
        Kenapa cerita di sini
      </h2>

      <ul className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
        {VALUE_PROPS.map((prop) => (
          <li
            key={prop.title}
            className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              <span aria-hidden="true" className="mr-2">
                {prop.glyph}
              </span>
              {prop.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              {prop.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LandingPreviewFeed() {
  return (
    <section aria-labelledby="contoh-feed" className="px-[var(--spacing-gutter)] py-12">
      <h2
        id="contoh-feed"
        className="text-center text-2xl font-bold text-[var(--color-text)]"
      >
        Kira-kira begini isinya
      </h2>

      {/*
       * Stated in the visible copy, not only in a code comment: these are
       * written examples. A visitor should never wonder whether they are
       * reading a stranger's real curhat on a public page.
       */}
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-[var(--color-muted)]">
        Contoh tampilan yang kami tulis sendiri — bukan curhat asli dari siapa pun.
        Curhat beneran cuma bisa dibaca setelah kamu masuk.
      </p>

      <ul className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PREVIEW_CURHAT.map((item) => (
          <li key={item.id}>
            <CurhatCard
              postId={item.id}
              title={item.title}
              excerpt={item.excerpt}
              mood={item.mood}
              intent={item.intent}
              categoryName={item.categoryName}
              authorLabel={item.authorLabel}
              isAnonymous={item.isAnonymous}
              replyCount={item.replyCount}
              createdAtLabel={item.createdAtLabel}
              variant={item.variant}
              // No `onOpen`: there is nothing to open. These do not correspond
              // to posts, so the card renders without a "Baca" action.
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] px-[var(--spacing-gutter)] py-10">
      <div className="mx-auto max-w-4xl">
        <ul className="space-y-2 text-sm text-[var(--color-muted)]">
          {HONESTY_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>

        <nav aria-label="Tautan legal" className="mt-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-[var(--size-touch)] items-center text-sm font-semibold text-[var(--color-text)] underline underline-offset-4"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-6 text-sm text-[var(--color-muted)]">© 2026 CURHAT DONG</p>
      </div>
    </footer>
  );
}
