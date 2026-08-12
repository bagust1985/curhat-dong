/**
 * Applies the theme before first paint.
 *
 * Runs inline in <head> so the page never flashes light before switching to
 * dark. On a product people open at 2am, that flash is not a cosmetic issue.
 *
 * Order of precedence: explicit user choice > Midnight Mode (21:00–04:00) >
 * OS preference.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem('curhat-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
      return;
    }
    if (stored === 'system' || stored === null) {
      var hour = new Date().getHours();
      var isNight = hour >= 21 || hour < 4;
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isNight) {
        document.documentElement.setAttribute('data-theme', 'midnight');
      } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  } catch (e) {
    /* localStorage unavailable — fall through to the CSS media query */
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
