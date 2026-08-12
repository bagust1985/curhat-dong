/**
 * The boundary between the safety engine and whatever classifies content.
 *
 * E07 owns the decisions; E08 owns the provider. Defining the port here means
 * the fallback behaviour can be built and tested against a provider that is
 * deliberately broken, which is the case that actually matters — the safe path
 * is the one nobody exercises until production.
 */

export const SAFETY_CLASSIFIER = Symbol('CURHAT_SAFETY_CLASSIFIER');

/** Per-category risk in 0..1. Absent means "not assessed". */
export interface RiskScores {
  toxicity?: number;
  hate?: number;
  threat?: number;
  harassment?: number;
  sexual?: number;
  self_harm?: number;
  violence?: number;
  scam?: number;
  spam?: number;
  doxxing?: number;
}

export interface ClassificationResult {
  emotion?: string;
  topic?: string;
  intent?: string;
  urgency?: string;
  riskScores: RiskScores;
  provider: 'anthropic' | 'openai' | 'local';
  model: string;
  promptVersion: string;
}

export class ClassifierUnavailableError extends Error {
  constructor(readonly reason: 'timeout' | 'provider_error' | 'not_configured') {
    super(`Safety classifier unavailable: ${reason}`);
    this.name = 'ClassifierUnavailableError';
  }
}

export interface SafetyClassifier {
  /**
   * Classifies text.
   *
   * Throws `ClassifierUnavailableError` when it cannot produce a verdict.
   * Throwing rather than returning an all-zero result is deliberate: a caller
   * that forgets to check a flag would read "no risk found" and publish, which
   * is the failure mode this whole design exists to prevent.
   */
  classify(text: string): Promise<ClassificationResult>;
}

/**
 * Stand-in until the AI Gateway lands (E08).
 *
 * Always reports itself unavailable, so every post takes the documented
 * fail-safe branch (TECH-SPEC §4.2) rather than a silently permissive one.
 */
export class UnconfiguredSafetyClassifier implements SafetyClassifier {
  classify(): Promise<ClassificationResult> {
    return Promise.reject(new ClassifierUnavailableError('not_configured'));
  }
}
