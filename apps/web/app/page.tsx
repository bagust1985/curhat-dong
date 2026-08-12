import { THEMES, type ThemeName } from '../lib/tokens';
import { AA_NORMAL_TEXT, AA_UI_COMPONENT, contrastRatio } from '../lib/contrast';

/**
 * Token reference page (E01-T06).
 *
 * Temporary: replaced by the real landing page in E15-T05. It exists so the
 * design tokens can be seen rendered — and so the contrast numbers are visible
 * next to the swatches rather than buried in a test report.
 */

const PAIRS: Array<{ fg: keyof (typeof THEMES)['dark']; bg: 'bg' | 'surface'; need: number }> = [
  { fg: 'text', bg: 'bg', need: AA_NORMAL_TEXT },
  { fg: 'muted', bg: 'bg', need: AA_NORMAL_TEXT },
  { fg: 'brand', bg: 'bg', need: AA_UI_COMPONENT },
  { fg: 'primary', bg: 'bg', need: AA_UI_COMPONENT },
  { fg: 'focus', bg: 'bg', need: AA_UI_COMPONENT },
  { fg: 'danger', bg: 'bg', need: AA_NORMAL_TEXT },
];

export default function TokensPage() {
  const themeNames = Object.keys(THEMES) as ThemeName[];

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold">CURHAT DONG — Design Tokens</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Di sini kamu nggak harus terlihat baik-baik saja.
      </p>

      <section className="mt-10 space-y-8">
        {themeNames.map((name) => {
          const t = THEMES[name];
          return (
            <div
              key={name}
              data-theme={name}
              className="rounded-[var(--radius-curhat)] border border-[var(--color-border)] bg-[var(--color-bg)] p-6"
            >
              <h2 className="text-lg font-semibold text-[var(--color-text)]">{name}</h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(t).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-[var(--radius-chip)] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text)]"
                    style={{ backgroundColor: value }}
                    title={`${key} ${value}`}
                  >
                    <span className="sr-only">{key}</span>
                  </span>
                ))}
              </div>

              <button
                type="button"
                className="mt-5 min-h-[var(--size-touch)] rounded-[var(--radius-action)] bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-primary-fg)]"
              >
                Mulai Curhat
              </button>

              <dl className="mt-5 space-y-1 text-sm text-[var(--color-muted)]">
                {PAIRS.map(({ fg, bg, need }) => {
                  const ratio = contrastRatio(t[fg], t[bg]);
                  return (
                    <div key={`${fg}-${bg}`} className="flex gap-2">
                      <dt>
                        {fg} / {bg}
                      </dt>
                      <dd>
                        {ratio.toFixed(2)}:1 — {ratio >= need ? 'lolos AA' : 'GAGAL AA'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </section>
    </main>
  );
}
