import { Injectable } from '@nestjs/common';

/**
 * Local rule engine — TECH-SPEC §4.1, §4.2.
 *
 * Runs synchronously before anything is published, and produces the
 * `highRisk` signal that decides what happens when AI analysis is unavailable
 * or times out:
 *
 *   AI unavailable + no local high-risk signal → publish as L1, re-analyse later
 *   AI unavailable + local high-risk signal    → HOLD + moderation case
 *
 * Without this, "AI is down" would mean "publish everything unchecked", which
 * is precisely the bypass CLAUDE.md non-negotiable #1 forbids.
 *
 * SCOPE NOTE: this is the minimum needed to keep the fallback path honest
 * while E07 and E08 are still to come. E07-T01 and E07-T02 replace it with the
 * full engine (configurable patterns, scam and spam detection). It is
 * deliberately biased towards sensitivity: a false positive here means a post
 * is reviewed, a false negative means a crisis signal is published unseen.
 */

export interface LocalRuleResult {
  /** Drives the fail-safe branch when AI is unavailable. */
  highRisk: boolean;
  /** Personal data detected — a pre-submit warning, never a block (PRD §15). */
  containsPersonalData: boolean;
  /** Spam or scam shape — raises review priority, never blocks on its own. */
  abuseSuspected: boolean;
  /** Which detectors fired. Stored on the safety event, never shown to the user. */
  signals: string[];
}

/**
 * Indonesian and English expressions of immediate self-harm risk.
 *
 * Kept close to explicit statements of intent. Broad emotional vocabulary is
 * exactly what this product is for — "aku capek banget" is an ordinary curhat,
 * not a crisis, and treating it as one would hold half the feed for review and
 * teach people that being honest here gets them silenced.
 */
const HIGH_RISK_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'self_harm_intent_id', pattern: /\b(mau|pengen|ingin|akan)\s+(bunuh\s*diri|mati\s*aja)\b/i },
  { id: 'self_harm_plan_id', pattern: /\b(cara|gimana)\s+(bunuh\s*diri|mengakhiri\s+hidup)\b/i },
  { id: 'self_harm_goodbye_id', pattern: /\b(selamat\s+tinggal|pamit)\s+(semua|semuanya)\b.*\b(terakhir|selamanya)\b/i },
  { id: 'self_harm_intent_en', pattern: /\b(want|going)\s+to\s+(kill\s+myself|end\s+(my\s+life|it\s+all))\b/i },
  { id: 'self_harm_method', pattern: /\b(overdosis|gantung\s+diri|potong\s+nadi|loncat\s+dari)\b/i },
  { id: 'threat_to_others', pattern: /\b(gue|aku|saya)\s+(akan|mau|bakal)\s+(bunuh|habisi)\s+(dia|lo|kamu|mereka)\b/i },
];

/**
 * Spam and scam patterns — PRD §15, E07-T14.
 *
 * These raise a *review* signal, never an automatic block. A curhat about
 * being scammed contains all the same words as a scam, and silencing someone
 * describing what happened to them would be the exact opposite of the point.
 */
const ABUSE_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'scam_investment', pattern: /\b(profit|untung)\s+(pasti|dijamin|100%)\b/i },
  { id: 'scam_contact', pattern: /\b(hubungi|chat|wa)\s+(saya|admin)\s+.*\b(sekarang|buruan)\b/i },
  { id: 'scam_money', pattern: /\b(transfer|kirim)\s+(uang|dana|dp)\s+.*\b(dulu|sekarang)\b/i },
  { id: 'spam_link_shortener', pattern: /\b(bit\.ly|tinyurl|s\.id|cutt\.ly)\/\S+/i },
  { id: 'spam_repeated_url', pattern: /(https?:\/\/\S+[\s\S]*){4,}/i },
  { id: 'spam_all_caps', pattern: /\b[A-Z]{15,}\b/ },
];

/**
 * Personal-data patterns — PRD §15 anti-doxxing.
 *
 * Detection triggers a warning before submitting. It never blocks: someone
 * sharing their own phone number is making a choice, and this product does not
 * override it — it only makes sure it was noticed.
 */
const PERSONAL_DATA_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'nik', pattern: /\b\d{16}\b/ },
  { id: 'phone_id', pattern: /\b(?:\+62|62|0)8\d{2}[-\s]?\d{3,4}[-\s]?\d{3,5}\b/ },
  { id: 'email', pattern: /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/ },
  { id: 'bank_account', pattern: /\b(rek(?:ening)?|no\.?\s*rek)\b[\s:.]*\d{8,}/i },
  { id: 'address', pattern: /\b(jl\.?|jalan)\s+[A-Za-z].{3,}\b(no\.?\s*\d+|rt\s*\d+|rw\s*\d+)/i },
];

@Injectable()
export class LocalRulesService {
  /**
   * Evaluates text. Synchronous and cheap — it runs inside the submit request,
   * so it must not add latency the user can feel.
   */
  evaluate(text: string): LocalRuleResult {
    const signals: string[] = [];
    let highRisk = false;
    let containsPersonalData = false;
    let abuseSuspected = false;

    for (const rule of HIGH_RISK_PATTERNS) {
      if (rule.pattern.test(text)) {
        highRisk = true;
        signals.push(`high_risk:${rule.id}`);
      }
    }

    for (const rule of PERSONAL_DATA_PATTERNS) {
      if (rule.pattern.test(text)) {
        containsPersonalData = true;
        signals.push(`personal_data:${rule.id}`);
      }
    }

    for (const rule of ABUSE_PATTERNS) {
      if (rule.pattern.test(text)) {
        abuseSuspected = true;
        signals.push(`abuse:${rule.id}`);
      }
    }

    return { highRisk, containsPersonalData, abuseSuspected, signals };
  }

  /**
   * Near-duplicate detection for repeated posting (PRD §15 anti-spam).
   *
   * Jaccard over word sets — crude, but it catches copy-paste flooding without
   * flagging someone who writes about the same subject twice. Deliberately
   * lenient: people in distress often circle the same thing, and treating that
   * as spam would punish exactly the wrong person.
   */
  isNearDuplicate(candidate: string, recent: readonly string[], threshold = 0.9): boolean {
    const tokenise = (text: string) =>
      new Set(
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((word) => word.length > 2),
      );

    const candidateTokens = tokenise(candidate);
    if (candidateTokens.size < 5) return false;

    for (const previous of recent) {
      const previousTokens = tokenise(previous);
      let shared = 0;
      for (const token of candidateTokens) {
        if (previousTokens.has(token)) shared += 1;
      }

      const union = candidateTokens.size + previousTokens.size - shared;
      if (union > 0 && shared / union >= threshold) return true;
    }

    return false;
  }

  /** Copy for the pre-submit anti-doxxing warning (DESIGN-REF §2.6). */
  personalDataWarning(): string {
    return 'Sepertinya curhatanmu berisi informasi pribadi. Kamu yakin ingin membagikannya?';
  }
}
