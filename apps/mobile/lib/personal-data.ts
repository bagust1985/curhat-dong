/**
 * Client-side personal-data hints — E15-T09, ported in E16-T05. DESIGN-REF §2.6, PRD §15.
 *
 * Mirrors the server's patterns (`local-rules.service.ts`) so the warning can
 * appear **while someone is typing**, before they press submit. The server
 * still runs its own check on submit; this is not a replacement for it and
 * cannot be, because the client is exactly what an attacker controls.
 *
 * The warning **never blocks**. Somebody may have a good reason to include a
 * detail we flagged, and this product does not overrule them about their own
 * story — it makes sure they noticed.
 *
 * Kept as a small list on purpose. A broad detector that fires on ordinary
 * sentences teaches people to dismiss the warning without reading it, which is
 * worse than not having one.
 */

export interface PersonalDataHint {
  id: string;
  /** What was spotted, in words the writer will recognise in their own text. */
  label: string;
}

const PATTERNS: ReadonlyArray<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'nik', label: 'nomor 16 digit (kayak NIK)', pattern: /\b\d{16}\b/ },
  {
    id: 'phone_id',
    label: 'nomor HP',
    pattern: /\b(?:\+62|62|0)8\d{2}[-\s]?\d{3,4}[-\s]?\d{3,5}\b/,
  },
  { id: 'email', label: 'alamat email', pattern: /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/ },
  {
    id: 'bank_account',
    label: 'nomor rekening',
    pattern: /\b(rek(?:ening)?|no\.?\s*rek)\b[\s:.]*\d{8,}/i,
  },
  {
    id: 'address',
    label: 'alamat rumah',
    pattern: /\b(jl\.?|jalan)\s+[A-Za-z].{3,}\b(no\.?\s*\d+|rt\s*\d+|rw\s*\d+)/i,
  },
  {
    id: 'social_handle',
    label: 'akun media sosial',
    pattern: /(?:^|\s)@[A-Za-z0-9._]{3,}\b/,
  },
];

export function detectPersonalData(text: string): PersonalDataHint[] {
  return PATTERNS.filter((rule) => rule.pattern.test(text)).map(({ id, label }) => ({ id, label }));
}

/** The exact sentence from DESIGN-REF §2.6, matching the server's copy. */
export const PERSONAL_DATA_WARNING =
  'Sepertinya curhatanmu berisi informasi pribadi. Kamu yakin ingin membagikannya?';
