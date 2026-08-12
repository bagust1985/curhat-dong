/**
 * Placeholder for the three legal documents — E15-T05.
 *
 * The real text is E17-T10 and needs a lawyer's review before it goes up
 * (PRD §25.1–§25.3). Until then the routes exist so the landing-page footer
 * never points at a 404, and they say plainly that the document is not ready.
 *
 * Two things this page deliberately does not do:
 *
 *  - it does not paraphrase what the policy will say. A draft that reads like a
 *    policy is one someone can rely on, and consent recorded against it would be
 *    consent to nothing;
 *  - it does not opt into indexing. Legal pages are allowed to be indexed
 *    (PRD §13) — once they contain the reviewed document, not before.
 */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-2xl px-[var(--spacing-gutter)] py-16">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>

      <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
        Dokumen ini masih kami siapkan dan belum berlaku. Naskahnya akan tayang di
        halaman ini sebelum CURHAT DONG dibuka untuk umum, dalam bahasa yang bisa
        dibaca orang biasa — bukan cuma pasal.
      </p>

      <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
        Ada yang mau ditanyakan lebih dulu? Kirim email ke{' '}
        <a
          href="mailto:halo@curhatdong.com"
          className="font-semibold text-[var(--color-text)] underline underline-offset-4"
        >
          halo@curhatdong.com
        </a>
        .
      </p>

      <p className="mt-8">
        <a
          href="/"
          className="inline-flex min-h-[var(--size-touch)] items-center font-semibold text-[var(--color-text)] underline underline-offset-4"
        >
          Kembali ke halaman depan
        </a>
      </p>
    </main>
  );
}
