import { CurhatCard } from './curhat-card';
import {
  HONESTY_NOTES,
  LEGAL_LINKS,
  PREVIEW_CURHAT,
  VALUE_PROPS,
  androidApkUrl,
} from '../lib/landing';

/**
 * Landing page sections — E15-T05. DESIGN-REF §2.1.
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

export function LandingHero() {
  const apkUrl = androidApkUrl();

  return (
    <section className="px-[var(--spacing-gutter)] pt-16 pb-12 text-center">
      <p className="text-sm font-semibold tracking-widest text-[var(--color-brand)]">
        CURHAT DONG
      </p>

      <h1 className="mx-auto mt-4 max-w-2xl text-3xl leading-tight font-bold text-balance text-[var(--color-text)] sm:text-4xl">
        Kadang kita nggak butuh solusi. Kita cuma butuh didengar.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
        Tempat cerita buat kamu yang lagi capek, bingung, atau cuma pengen ngeluarin isi
        kepala. Nggak harus terlihat baik-baik saja di sini.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a
          href="/auth"
          className="inline-flex min-h-[var(--size-touch)] w-full max-w-xs items-center justify-center rounded-[var(--radius-action)] bg-[var(--color-primary)] px-6 font-semibold text-[var(--color-primary-fg)] sm:w-auto"
        >
          Mulai Cerita
        </a>

        {apkUrl ? (
          <a
            href={apkUrl}
            className="inline-flex min-h-[var(--size-touch)] w-full max-w-xs items-center justify-center rounded-[var(--radius-action)] border border-[var(--color-brand)] px-6 font-semibold text-[var(--color-text)] sm:w-auto"
          >
            Download APK Android
          </a>
        ) : (
          // No build to link to yet. Saying so is better than a dead link or a
          // button that does nothing when tapped.
          <p className="max-w-xs text-sm text-[var(--color-muted)]">
            Aplikasi Android lagi disiapkan. Sementara ini bisa dibuka lewat browser.
          </p>
        )}
      </div>
    </section>
  );
}

export function LandingValueProps() {
  return (
    <section
      aria-labelledby="kenapa-di-sini"
      className="px-[var(--spacing-gutter)] py-12"
    >
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
