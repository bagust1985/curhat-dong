/**
 * Conversation titles — E09-T01.
 *
 * The title is the one part of a conversation that shows up in a list, which
 * is exactly where someone else might see it: a shared laptop, a screenshot, a
 * notification shade. So it never echoes what was written.
 *
 * A classifier topic label is allowed only when it matches the product's own
 * category vocabulary. Anything else — including a topic the model invented —
 * falls back to the date, because "Obrolan soal percobaan bunuh diri" is
 * precisely the sentence this function exists to prevent.
 */

const SAFE_TOPICS: Readonly<Record<string, string>> = Object.freeze({
  relationship: 'hubungan',
  hubungan: 'hubungan',
  marriage: 'pernikahan',
  pernikahan: 'pernikahan',
  family: 'keluarga',
  keluarga: 'keluarga',
  work: 'kerjaan',
  kerjaan: 'kerjaan',
  career: 'karier',
  karier: 'karier',
  finance: 'keuangan',
  keuangan: 'keuangan',
  friendship: 'pertemanan',
  pertemanan: 'pertemanan',
  college: 'kuliah',
  kuliah: 'kuliah',
  parenting: 'jadi orang tua',
  business: 'usaha',
  usaha: 'usaha',
});

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** `12 Agustus` in WIB — the same day boundary quota and budget use. */
function wibDateLabel(at: Date): string {
  const shifted = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  return `${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]}`;
}

export function conversationTitle(input: { topic?: string | undefined; at: Date }): string {
  const topic = input.topic ? SAFE_TOPICS[input.topic.trim().toLowerCase()] : undefined;

  return topic ? `Obrolan soal ${topic}` : `Obrolan ${wibDateLabel(input.at)}`;
}
