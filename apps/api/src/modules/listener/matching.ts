import type { ListenerSafetyStatus } from '@curhat/database';

/**
 * Candidate filtering and ranking — E10-T05, E10-T06, TECH-SPEC §4.5.
 *
 * Pure functions with no I/O, because CLAUDE.md requires a unit test for the
 * matching filter and because this is where a mistake is invisible: a filter
 * that silently lets one condition through does not throw, it just quietly
 * pairs someone with a person who blocked them.
 */

export interface CandidateSnapshot {
  listenerId: string;
  topics: string[];
  languages: string[];
  safetyStatus: ListenerSafetyStatus;
  guidelinesAccepted: boolean;
  isAvailable: boolean;
  maxConcurrent: number;
  activeSessions: number;
  sessionsToday: number;
  /** Null when they have not finished a session today. */
  lastSessionEndedAt: Date | null;
  /**
   * Rates in 0..1, not counts.
   *
   * A count would make ranking a popularity contest — exactly the leaderboard
   * PRD §11 rules out — and would bury every new listener under whoever
   * started first. A rate lets someone good be found on their tenth session.
   */
  helpfulScore: number;
  feltHeardScore: number;
  /** Sessions this listener has completed on the requested topic. */
  topicExperience: number;
  /** A previous session with this requester that ended well. */
  previousPositive: boolean;
}

export interface MatchCriteria {
  requesterId: string;
  topic: string;
  language: string;
  /** Blocked in either direction — the relationship is symmetric (E03-T11). */
  blockedUserIds: ReadonlySet<string>;
  /** Already offered this request; never offered twice. */
  alreadyOfferedIds: ReadonlySet<string>;
  maxSessionsPerDay: number;
  cooldownMinutes: number;
  now: Date;
}

export type RejectionReason =
  | 'self'
  | 'blocked'
  | 'unavailable'
  | 'safety_status'
  | 'guidelines_not_accepted'
  | 'language'
  | 'topic'
  | 'concurrency'
  | 'daily_cap'
  | 'cooldown'
  | 'already_offered';

/**
 * Why a candidate was excluded, or null when they are eligible.
 *
 * Returns the reason rather than a boolean so the failure path can say
 * something true ("nobody is free right now") instead of guessing.
 */
export function rejectionFor(
  candidate: CandidateSnapshot,
  criteria: MatchCriteria,
): RejectionReason | null {
  if (candidate.listenerId === criteria.requesterId) return 'self';
  if (criteria.blockedUserIds.has(candidate.listenerId)) return 'blocked';
  if (criteria.alreadyOfferedIds.has(candidate.listenerId)) return 'already_offered';
  if (!candidate.isAvailable) return 'unavailable';
  if (candidate.safetyStatus !== 'ok') return 'safety_status';
  if (!candidate.guidelinesAccepted) return 'guidelines_not_accepted';
  if (!candidate.languages.includes(criteria.language)) return 'language';

  // An empty topic list means "anything" — a listener who never picked topics
  // is available for all of them rather than for none.
  if (candidate.topics.length > 0 && !candidate.topics.includes(criteria.topic)) {
    return 'topic';
  }

  if (candidate.activeSessions >= candidate.maxConcurrent) return 'concurrency';
  if (candidate.sessionsToday >= criteria.maxSessionsPerDay) return 'daily_cap';

  if (candidate.lastSessionEndedAt) {
    const readyAt = candidate.lastSessionEndedAt.getTime() + criteria.cooldownMinutes * 60_000;
    if (criteria.now.getTime() < readyAt) return 'cooldown';
  }

  return null;
}

export function filterCandidates(
  candidates: readonly CandidateSnapshot[],
  criteria: MatchCriteria,
): CandidateSnapshot[] {
  return candidates.filter((candidate) => rejectionFor(candidate, criteria) === null);
}

export interface RankWeights {
  helpful: number;
  feltHeard: number;
  topicExperience: number;
  previousPositive: number;
}

/**
 * Weights over 0..1 rates, so the ceilings are readable at a glance:
 * helpfulness 1.0, Felt Heard 1.5, a good previous session 2.0, and topic
 * experience well under all of them — it is a tiebreaker, not the driver.
 */
export const DEFAULT_RANK_WEIGHTS: RankWeights = {
  helpful: 1,
  feltHeard: 1.5,
  topicExperience: 0.2,
  previousPositive: 2,
};

/**
 * Scores a candidate.
 *
 * Nothing here reads decline or timeout counts, and nothing ever will: PRD
 * §11.2 forbids ranking from punishing someone who protected their own limits.
 * A listener who says "not now" must not slide down the list for it, or the
 * limits become a trap.
 *
 * Felt Heard outweighs helpfulness because it is the North Star metric and the
 * honest one — it is the requester's own answer, not a count of activity.
 */
export function scoreCandidate(
  candidate: CandidateSnapshot,
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
): number {
  return (
    candidate.helpfulScore * weights.helpful +
    candidate.feltHeardScore * weights.feltHeard +
    // Diminishing: the difference between 0 and 5 sessions on a topic matters
    // far more than between 50 and 55.
    Math.log1p(Math.max(0, candidate.topicExperience)) * weights.topicExperience +
    (candidate.previousPositive ? weights.previousPositive : 0)
  );
}

export function rankCandidates(
  candidates: readonly CandidateSnapshot[],
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
): CandidateSnapshot[] {
  return [...candidates].sort((a, b) => {
    const difference = scoreCandidate(b, weights) - scoreCandidate(a, weights);
    // Stable tie-break so an equal-scoring pair does not reorder between calls
    // and produce a different "first candidate" on a retry.
    return difference !== 0 ? difference : a.listenerId.localeCompare(b.listenerId);
  });
}

/** Filter, rank, and cap to the number of attempts a request is allowed. */
export function selectCandidates(
  candidates: readonly CandidateSnapshot[],
  criteria: MatchCriteria,
  weights: RankWeights,
  limit: number,
): CandidateSnapshot[] {
  return rankCandidates(filterCandidates(candidates, criteria), weights).slice(0, limit);
}

export function mergeRankWeights(override: unknown): RankWeights {
  if (!override || typeof override !== 'object') return DEFAULT_RANK_WEIGHTS;
  const partial = override as Partial<RankWeights>;

  const pick = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  return {
    helpful: pick(partial.helpful, DEFAULT_RANK_WEIGHTS.helpful),
    feltHeard: pick(partial.feltHeard, DEFAULT_RANK_WEIGHTS.feltHeard),
    topicExperience: pick(partial.topicExperience, DEFAULT_RANK_WEIGHTS.topicExperience),
    previousPositive: pick(partial.previousPositive, DEFAULT_RANK_WEIGHTS.previousPositive),
  };
}
