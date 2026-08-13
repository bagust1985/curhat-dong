/**
 * Relative timestamps — E15-T08.
 *
 * Indonesian, and deliberately coarse. "2 jam lalu" is what a reader needs; a
 * precise clock time on a curhat is a detail that helps nobody read it and
 * helps somebody work out who wrote it.
 *
 * Takes `now` as an argument so the output is a pure function of its inputs —
 * a timestamp helper that reads the wall clock internally is one that fails in
 * CI at midnight.
 */
export function relativeTime(value: string | number | Date, now: Date = new Date()): string {
  const then = value instanceof Date ? value : new Date(value);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (Number.isNaN(seconds)) return '';
  // Clock skew between the browser and the server can put a fresh post a few
  // seconds in the future. "Baru aja" is truer than "-3 detik lalu".
  if (seconds < 60) return 'Baru aja';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari lalu`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} minggu lalu`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan lalu`;

  return `${Math.floor(days / 365)} tahun lalu`;
}
