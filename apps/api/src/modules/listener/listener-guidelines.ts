/**
 * Listener guidelines — E10-T01, PRD §11.1.
 *
 * Acceptance is recorded with this version string, so raising it asks every
 * listener to read the new text before taking another session. That is the
 * whole reason the version is a constant in code rather than a boolean in the
 * database: "they accepted something, once" is not an audit trail.
 */

export const LISTENER_GUIDELINES_VERSION = '2026-08-12';

export interface GuidelineSection {
  title: string;
  body: string;
}

/**
 * The six points PRD §11.1 requires, in Indonesian, in the product's own voice.
 *
 * Point 1 and point 6 are the load-bearing ones: a volunteer who thinks they
 * are a therapist is dangerous, and a volunteer who thinks quitting is failure
 * will keep going past the point where they should have stopped.
 */
export const LISTENER_GUIDELINES: readonly GuidelineSection[] = Object.freeze([
  {
    title: 'Kamu bukan konselor',
    body:
      'Kamu bukan terapis, psikolog, atau tenaga medis di sini. Jangan mendiagnosis, ' +
      'jangan menyarankan atau menghentikan obat, dan jangan mengaku punya kualifikasi ' +
      'yang tidak kamu punya. Kalau situasinya butuh profesional, arahkan ke sana.',
  },
  {
    title: 'Tugasmu mendengarkan',
    body:
      'Bukan menyelesaikan masalah orang. Tidak apa-apa kalau kamu tidak punya jawaban — ' +
      'sering kali yang dicari memang bukan jawaban.',
  },
  {
    title: 'Jaga kerahasiaan',
    body:
      'Isi sesi tidak boleh keluar dari sesi. Tidak ke teman, tidak ke media sosial, ' +
      'tidak dalam bentuk screenshot.',
  },
  {
    title: 'Jaga batas',
    body:
      'Jangan menukar kontak pribadi, jangan meminta identitas asli, jangan mengajak ' +
      'pindah ke platform lain, dan jangan menjalin hubungan romantis atau transaksional ' +
      'dari sesi.',
  },
  {
    title: 'Kapan harus escalate',
    body:
      'Kalau ada tanda seseorang dalam bahaya, tekan tombol Escalate di room. Tim moderasi ' +
      'akan menanganinya. Tetap hadir, jangan menjanjikan penyelamatan, dan jangan pernah ' +
      'berjanji merahasiakan sesuatu yang membahayakan nyawa.',
  },
  {
    title: 'Kamu boleh berhenti',
    body:
      'Mengakhiri sesi karena kamu tidak sanggup bukan kegagalan — itu justru yang benar. ' +
      'Kamu tidak akan kehilangan apa pun karena menjaga dirimu sendiri.',
  },
]);

/** Shown after an escalation — PRD §11.3 step 5. */
export const ESCALATION_GUIDANCE = {
  message: 'Makasih. Kamu udah lakuin yang benar.',
  points: [
    'Tetap hadir kalau kamu masih sanggup.',
    'Jangan menjanjikan penyelamatan.',
    'Jangan berjanji merahasiakan hal yang membahayakan nyawa.',
    'Kamu boleh keluar dari sesi ini kapan pun, tanpa konsekuensi apa pun.',
  ],
} as const;
