import { CurhatCard } from './curhat-card';
import { Button, Wordmark } from './ui';
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

export function LandingNavbar() {
  const apkUrl = androidApkUrl();

  return (
    <nav
      aria-label="Navigasi landing"
      className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-[var(--radius-chip)] bg-[var(--color-surface)] px-5 py-3 shadow-[var(--shadow-card)]"
    >
      <a href="#beranda" className="flex min-h-[var(--size-touch)] items-center gap-2.5">
        {/*
          The app icon, not the mascot cutout: this slot is the logo, and it
          should be the same mark somebody sees on their home screen after
          installing. Decorative next to the wordmark, which carries the name.
        */}
        {/* 96px source for a 36px slot: enough for 2x screens, and 17 KB
            instead of the 344 KB full-size mark on the one page whose load
            time decides whether a stranger stays. */}
        <img
          src="/brand/logo-96.png"
          alt=""
          width={96}
          height={96}
          className="size-9 rounded-[10px]"
        />
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
    <section id="beranda" className="relative isolate mx-auto mt-6 max-w-5xl">
      {/* The same lit-room gesture as Beranda, so the product looks like the
          page that sold it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-96"
        style={{ background: 'var(--wash-top)' }}
      />

      <div className="grid items-center gap-8 rounded-[2rem] bg-[var(--color-surface-alt)] px-8 pt-12 pb-0 sm:grid-cols-[3fr_2fr] sm:px-12">
        <div className="pb-12 text-center sm:text-left">
          <h1 className="text-[40px] leading-[1.08] font-black tracking-[-0.03em] text-balance text-[var(--color-text)] sm:text-[56px]">
            {HERO.title}
          </h1>

          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-[var(--color-muted)] max-sm:mx-auto">
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
            {/*
              Four different tints rather than four identical brand-pink discs.
              At full saturation, repeated four times, the accent stopped being
              an accent — and the tints let the AI feature carry the lavender it
              carries everywhere else.
            */}
            <span
              aria-hidden="true"
              className="mx-auto flex size-14 items-center justify-center rounded-[18px] text-2xl"
              style={{ backgroundColor: feature.tint }}
            >
              {feature.glyph}
            </span>
            <h3 className="mt-4 text-base font-black text-[var(--color-text)]">{feature.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">
              {feature.body}
            </p>
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
        className="text-center text-3xl font-black tracking-[-0.025em] text-[var(--color-text)]"
      >
        Kenapa cerita di sini
      </h2>

      <ul className="mx-auto mt-9 grid max-w-4xl gap-4 sm:grid-cols-2">
        {VALUE_PROPS.map((prop) => (
          <li
            key={prop.title}
            className="rounded-[var(--radius-curhat)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]"
          >
            <h3 className="flex items-center gap-3 text-base font-black text-[var(--color-text)]">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-[14px] text-lg"
                style={{ backgroundColor: prop.tint }}
              >
                {prop.glyph}
              </span>
              {prop.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{prop.body}</p>
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
        className="text-center text-3xl font-black tracking-[-0.025em] text-[var(--color-text)]"
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
        {/*
         * These two lines are the 18+ limit and "this is not an emergency
         * service" (PRD §25.4, §15). They were set as muted fine print, which
         * is the one treatment they must not have: they are standing statements
         * about what this product is, and somebody in a bad state should be
         * able to read them. Body ink on a quiet panel, not a warning box —
         * DESIGN-REF §0 rules out the clinical register.
         */}
        <ul className="flex flex-col gap-2 rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm leading-relaxed text-[var(--color-text)]">
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
