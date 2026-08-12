import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RANK_WEIGHTS,
  filterCandidates,
  mergeRankWeights,
  rankCandidates,
  rejectionFor,
  scoreCandidate,
  selectCandidates,
  type CandidateSnapshot,
  type MatchCriteria,
} from './matching.js';

const NOW = new Date('2026-08-12T10:00:00Z');

function candidate(overrides: Partial<CandidateSnapshot> = {}): CandidateSnapshot {
  return {
    listenerId: 'listener-1',
    topics: ['work'],
    languages: ['id'],
    safetyStatus: 'ok',
    guidelinesAccepted: true,
    isAvailable: true,
    maxConcurrent: 3,
    activeSessions: 0,
    sessionsToday: 0,
    lastSessionEndedAt: null,
    helpfulScore: 0,
    feltHeardScore: 0,
    topicExperience: 0,
    previousPositive: false,
    ...overrides,
  };
}

function criteria(overrides: Partial<MatchCriteria> = {}): MatchCriteria {
  return {
    requesterId: 'requester-1',
    topic: 'work',
    language: 'id',
    blockedUserIds: new Set(),
    alreadyOfferedIds: new Set(),
    maxSessionsPerDay: 8,
    cooldownMinutes: 10,
    now: NOW,
    ...overrides,
  };
}

describe('matching filter (E10-T05)', () => {
  it('accepts an eligible candidate', () => {
    expect(rejectionFor(candidate(), criteria())).toBeNull();
  });

  it('never matches a requester with themselves', () => {
    expect(rejectionFor(candidate({ listenerId: 'requester-1' }), criteria())).toBe('self');
  });

  it('honours a block in either direction', () => {
    // The caller passes a set built from both directions (E03-T11); either way
    // the pair must never meet.
    const blocked = criteria({ blockedUserIds: new Set(['listener-1']) });

    expect(rejectionFor(candidate(), blocked)).toBe('blocked');
  });

  it('excludes a listener whose safety status is not clear', () => {
    for (const status of ['under_review', 'suspended'] as const) {
      expect(rejectionFor(candidate({ safetyStatus: status }), criteria())).toBe('safety_status');
    }
  });

  it('excludes a listener who has not accepted the guidelines', () => {
    expect(rejectionFor(candidate({ guidelinesAccepted: false }), criteria())).toBe(
      'guidelines_not_accepted',
    );
  });

  it('excludes an unavailable listener', () => {
    expect(rejectionFor(candidate({ isAvailable: false }), criteria())).toBe('unavailable');
  });

  it('requires a shared language', () => {
    expect(rejectionFor(candidate({ languages: ['en'] }), criteria())).toBe('language');
  });

  it('matches the topic, treating an empty list as "anything"', () => {
    expect(rejectionFor(candidate({ topics: ['family'] }), criteria())).toBe('topic');
    // Someone who never picked topics is open to all of them, not to none.
    expect(rejectionFor(candidate({ topics: [] }), criteria())).toBeNull();
  });

  it('respects the concurrency limit the listener chose', () => {
    expect(rejectionFor(candidate({ maxConcurrent: 2, activeSessions: 2 }), criteria())).toBe(
      'concurrency',
    );
    expect(
      rejectionFor(candidate({ maxConcurrent: 2, activeSessions: 1 }), criteria()),
    ).toBeNull();
  });

  it('stops offering once the daily cap is reached', () => {
    // The ninth session of the day is never offered (PRD §11.2).
    expect(rejectionFor(candidate({ sessionsToday: 8 }), criteria())).toBe('daily_cap');
    expect(rejectionFor(candidate({ sessionsToday: 7 }), criteria())).toBeNull();
  });

  it('keeps a listener out of the pool during cooldown', () => {
    const justFinished = new Date(NOW.getTime() - 5 * 60_000);
    const longDone = new Date(NOW.getTime() - 11 * 60_000);

    expect(rejectionFor(candidate({ lastSessionEndedAt: justFinished }), criteria())).toBe(
      'cooldown',
    );
    expect(rejectionFor(candidate({ lastSessionEndedAt: longDone }), criteria())).toBeNull();
  });

  it('never offers the same request to the same listener twice', () => {
    const repeat = criteria({ alreadyOfferedIds: new Set(['listener-1']) });

    expect(rejectionFor(candidate(), repeat)).toBe('already_offered');
  });

  it('filters a mixed pool down to the eligible ones', () => {
    const pool = [
      candidate({ listenerId: 'ok-1' }),
      candidate({ listenerId: 'blocked-1' }),
      candidate({ listenerId: 'busy-1', activeSessions: 3 }),
      candidate({ listenerId: 'ok-2', topics: [] }),
      candidate({ listenerId: 'suspended-1', safetyStatus: 'suspended' }),
    ];

    const eligible = filterCandidates(
      pool,
      criteria({ blockedUserIds: new Set(['blocked-1']) }),
    );

    expect(eligible.map((entry) => entry.listenerId)).toEqual(['ok-1', 'ok-2']);
  });
});

describe('matching ranking (E10-T06)', () => {
  it('puts a previous good match first', () => {
    // Scores are rates in 0..1, so a strong stranger tops out around 2.2 and a
    // familiar face who was good enough to come back to still wins.
    const ranked = rankCandidates([
      candidate({ listenerId: 'stranger', helpfulScore: 1, feltHeardScore: 0.8 }),
      candidate({
        listenerId: 'known',
        helpfulScore: 0.2,
        feltHeardScore: 0.5,
        previousPositive: true,
      }),
    ]);

    expect(ranked[0]?.listenerId).toBe('known');
  });

  it('weighs Felt Heard above raw helpfulness', () => {
    const feltHeard = candidate({ listenerId: 'felt-heard', feltHeardScore: 1 });
    const helpful = candidate({ listenerId: 'helpful', helpfulScore: 1 });

    expect(scoreCandidate(feltHeard)).toBeGreaterThan(scoreCandidate(helpful));
  });

  it('lets topic experience matter without letting it dominate', () => {
    const veteran = candidate({ listenerId: 'veteran', topicExperience: 50 });
    const newcomer = candidate({ listenerId: 'newcomer', topicExperience: 0, feltHeardScore: 1 });

    // 50 sessions of experience does not outrank a strong Felt Heard score.
    expect(rankCandidates([veteran, newcomer])[0]?.listenerId).toBe('newcomer');
  });

  it('does not punish declining or missing an offer', () => {
    // PRD §11.2: ranking must not penalise someone for protecting their own
    // limits. The snapshot has nowhere to express a decline count — verified
    // here so a future field cannot quietly start counting them.
    const snapshot = candidate();

    expect(Object.keys(snapshot)).not.toContain('declineCount');
    expect(Object.keys(snapshot)).not.toContain('timeoutCount');
    expect(Object.keys(snapshot)).not.toContain('missedOffers');
  });

  it('breaks ties deterministically', () => {
    const first = rankCandidates([candidate({ listenerId: 'b' }), candidate({ listenerId: 'a' })]);
    const second = rankCandidates([candidate({ listenerId: 'a' }), candidate({ listenerId: 'b' })]);

    expect(first.map((entry) => entry.listenerId)).toEqual(['a', 'b']);
    expect(second.map((entry) => entry.listenerId)).toEqual(['a', 'b']);
  });

  it('takes weights from config and falls back cleanly', () => {
    const weights = mergeRankWeights({ feltHeard: 10 });

    expect(weights.feltHeard).toBe(10);
    expect(weights.helpful).toBe(DEFAULT_RANK_WEIGHTS.helpful);
    expect(mergeRankWeights(null)).toEqual(DEFAULT_RANK_WEIGHTS);
    expect(mergeRankWeights({ helpful: 'banyak' })).toEqual(DEFAULT_RANK_WEIGHTS);
  });
});

describe('candidate selection (E10-T07)', () => {
  it('caps the shortlist at the allowed attempts', () => {
    const pool = Array.from({ length: 9 }, (_, index) =>
      candidate({ listenerId: `listener-${index}`, feltHeardScore: index }),
    );

    const selected = selectCandidates(pool, criteria(), DEFAULT_RANK_WEIGHTS, 5);

    expect(selected).toHaveLength(5);
    // Best first, so the earliest attempts are the most promising ones.
    expect(selected[0]?.listenerId).toBe('listener-8');
  });

  it('returns an empty shortlist rather than a bad match', () => {
    const pool = [candidate({ isAvailable: false }), candidate({ listenerId: 'requester-1' })];

    expect(selectCandidates(pool, criteria(), DEFAULT_RANK_WEIGHTS, 5)).toEqual([]);
  });
});
