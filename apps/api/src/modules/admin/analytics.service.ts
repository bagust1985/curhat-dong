import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { wibDayKey } from '../ai/wib-day.js';

export interface MetricCards {
  totalUsers: number;
  newUsers: number;
  dau: number;
  wau: number;
  mau: number;
  activeListeners: number;
  postsPerDay: number;
  commentsPerDay: number;
  aiConversations: number;
  listenerSessions: number;
  /** Reports per 1,000 published pieces of content (PRD §19.1). */
  reportRate: number;
  /** The North Star. Null when nobody has answered a prompt yet. */
  feltHeardRate: number | null;
  /** Tracked separately and never in the denominator (PRD §9). */
  feltHeardDismissed: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  /** Share of the step before it. */
  conversion: number | null;
}

export interface RetentionRow {
  cohortDate: string;
  cohortSize: number;
  d1: number;
  d7: number;
  d30: number;
}

export interface DashboardView {
  range: { from: string; to: string };
  cards: MetricCards;
  activationRate: number | null;
  responseRate: number | null;
  responseCoverage: number | null;
  medianFirstResponseSeconds: number | null;
  ai: { costUsd: number; callCount: number };
  moderation: {
    casesOpened: number;
    casesResolved: number;
    slaBreached: number;
    slaCompliance: number | null;
    /** Live count. Non-zero lights the alert strip (E14-T14). */
    criticalOpenNow: number;
  };
  /** Shown at the top of the dashboard when Critical is non-zero. */
  alert: string | null;
  /** Days in the range with no snapshot — an honest gap, not a zero. */
  missingDays: string[];
}

/**
 * How long after signup a "meaningful action" counts (PRD §19.1).
 */
const ACTIVATION_WINDOW_MS = 24 * 3_600_000;

/** DONG AI conversations need this many *user* messages to count (PRD §19.1). */
const ACTIVATION_AI_MESSAGES = 4;

/**
 * Dashboard and analytics — E14-T14. PRD §18, §19.1; DESIGN-REF §3.2, §3.10.
 *
 * Reads pre-aggregated daily rows rather than scanning the source tables
 * (`computeDay` writes them). Retention and time-to-first-response both need
 * wide scans, and a dashboard that takes twenty seconds is a dashboard nobody
 * opens — so it stops being consulted, which is worse than it being slow.
 *
 * Every definition here is PRD §19.1 verbatim, and two of them are easy to get
 * subtly wrong:
 *
 *  - **Felt Heard Rate** is `(yes + somewhat) / answered`, and a dismissed
 *    prompt is *not* in the denominator. Counting dismissals would make the
 *    North Star measure how annoying the prompt is, and the number would drift
 *    down every time it appeared at a bad moment.
 *  - **Meaningful action** excludes reactions. A reaction is too cheap to signal
 *    engagement, and including it would make Activation look healthy while
 *    nobody was actually talking to anybody.
 *
 * Nothing here reads a post body, a message or an AI conversation — the
 * aggregates are counts and timestamps only.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Aggregates one day into `analytics_daily`.
   *
   * Idempotent by design — an upsert keyed on the date — so a backfill can be
   * replayed and a corrected metric definition can be recomputed over history
   * rather than leaving two eras of incomparable numbers.
   *
   * Called by the `daily-analytics` job; the BullMQ wrapper lands with the
   * worker container in E17, exactly like `deliverDue()` and `expireOverdue()`.
   */
  async computeDay(day: Date = new Date()): Promise<{ date: string }> {
    const { start, end, key } = wibDayBounds(day);

    const [
      newUsers,
      postsPublished,
      commentsPosted,
      aiConversations,
      listenerSessions,
      activeListeners,
      reportsFiled,
      casesOpened,
      casesResolved,
      slaBreached,
      feltHeard,
      aiUsage,
      dau,
      wau,
      mau,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.curhatPost.count({
        where: { publishedAt: { gte: start, lt: end }, status: 'published' },
      }),
      this.prisma.comment.count({
        where: { createdAt: { gte: start, lt: end }, status: 'published' },
      }),
      this.prisma.aiConversation.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.listenerSession.count({ where: { startedAt: { gte: start, lt: end } } }),
      this.prisma.listenerSession
        .findMany({
          where: { startedAt: { gte: start, lt: end } },
          distinct: ['listenerId'],
          select: { listenerId: true },
        })
        .then((rows) => rows.length),
      this.prisma.report.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.moderationCase.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.moderationCase.count({ where: { resolvedAt: { gte: start, lt: end } } }),
      this.prisma.moderationCase.count({
        where: { resolvedAt: { gte: start, lt: end }, slaDueAt: { lt: end } },
      }),
      this.feltHeardForDay(start, end),
      this.aiUsageForDay(start, end),
      this.activeUserCount(new Date(end.getTime() - 86_400_000), end),
      this.activeUserCount(new Date(end.getTime() - 7 * 86_400_000), end),
      this.activeUserCount(new Date(end.getTime() - 30 * 86_400_000), end),
    ]);

    const [activatedUsers, responses] = await Promise.all([
      this.activatedUsersForDay(start, end),
      this.responseMetricsForDay(start, end),
    ]);

    const data = {
      newUsers,
      activeUsers: dau,
      dau,
      wau,
      mau,
      postsPublished,
      commentsPosted,
      aiConversations,
      listenerSessions,
      activeListeners,
      feltHeardAnswered: feltHeard.answered,
      feltHeardPositive: feltHeard.positive,
      feltHeardDismissed: feltHeard.dismissed,
      activatedUsers,
      postsWithResponse24h: responses.withResponse24h,
      medianFirstResponseSeconds: responses.medianSeconds,
      reportsFiled,
      aiCostUsd: aiUsage.costUsd,
      aiCallCount: aiUsage.callCount,
      casesOpened,
      casesResolved,
      slaBreached,
      computedAt: new Date(),
    };

    await this.prisma.analyticsDaily.upsert({
      where: { date: start },
      update: data,
      create: { date: start, ...data },
    });

    return { date: key };
  }

  /**
   * The dashboard, summed from daily rows.
   *
   * Rates are recomputed from the summed numerators and denominators rather
   * than averaged across days. Averaging daily percentages weights a quiet
   * Tuesday the same as a busy Saturday, which is how a dashboard ends up
   * disagreeing with a hand-written query.
   */
  async dashboard(days = 30): Promise<DashboardView> {
    const to = wibDayBounds(new Date()).start;
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);

    const [rows, totalUsers, criticalOpenNow] = await Promise.all([
      this.prisma.analyticsDaily.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.moderationCase.count({
        where: { queue: 'critical', status: { in: ['open', 'in_review', 'escalated'] } },
      }),
    ]);

    const sum = (pick: (row: (typeof rows)[number]) => number): number =>
      rows.reduce((total, row) => total + pick(row), 0);

    const feltHeardAnswered = sum((row) => row.feltHeardAnswered);
    const feltHeardPositive = sum((row) => row.feltHeardPositive);
    const postsPublished = sum((row) => row.postsPublished);
    const reportsFiled = sum((row) => row.reportsFiled);
    const newUsers = sum((row) => row.newUsers);
    const activatedUsers = sum((row) => row.activatedUsers);
    const casesResolved = sum((row) => row.casesResolved);
    const slaBreached = sum((row) => row.slaBreached);

    const latest = rows.at(-1);
    const medians = rows
      .map((row) => row.medianFirstResponseSeconds)
      .filter((value): value is number => value !== null);

    return {
      range: { from: dateKey(from), to: dateKey(to) },
      cards: {
        totalUsers,
        newUsers,
        // Point-in-time measures come from the newest snapshot, not a sum:
        // adding daily active users across a month counts one person thirty
        // times.
        dau: latest?.dau ?? 0,
        wau: latest?.wau ?? 0,
        mau: latest?.mau ?? 0,
        activeListeners: latest?.activeListeners ?? 0,
        postsPerDay: rows.length > 0 ? round(postsPublished / rows.length) : 0,
        commentsPerDay:
          rows.length > 0 ? round(sum((row) => row.commentsPosted) / rows.length) : 0,
        aiConversations: sum((row) => row.aiConversations),
        listenerSessions: sum((row) => row.listenerSessions),
        // Per 1,000 published pieces of content (PRD §19.1).
        reportRate: postsPublished > 0 ? round((reportsFiled / postsPublished) * 1000) : 0,
        // Null, not zero: "no data yet" and "nobody felt heard" are very
        // different things to put on a dashboard (E06-T06).
        feltHeardRate:
          feltHeardAnswered > 0 ? round(feltHeardPositive / feltHeardAnswered, 4) : null,
        feltHeardDismissed: sum((row) => row.feltHeardDismissed),
      },
      activationRate: newUsers > 0 ? round(activatedUsers / newUsers, 4) : null,
      responseRate:
        postsPublished > 0
          ? round(sum((row) => row.postsWithResponse24h) / postsPublished, 4)
          : null,
      responseCoverage: await this.responseCoverage(),
      // Median of daily medians is an approximation, and labelled as one below.
      medianFirstResponseSeconds:
        medians.length > 0 ? medians.sort((a, b) => a - b)[Math.floor(medians.length / 2)]! : null,
      ai: { costUsd: round(sum((row) => row.aiCostUsd), 4), callCount: sum((row) => row.aiCallCount) },
      moderation: {
        casesOpened: sum((row) => row.casesOpened),
        casesResolved,
        slaBreached,
        slaCompliance: casesResolved > 0 ? round(1 - slaBreached / casesResolved, 4) : null,
        criticalOpenNow,
      },
      alert:
        criticalOpenNow > 0
          ? `${criticalOpenNow} case Critical menunggu. Ini antrean yang paling tidak boleh menunggu.`
          : null,
      missingDays: this.missingDays(from, to, rows.map((row) => dateKey(row.date))),
    };
  }

  /**
   * Signup → activation funnel.
   *
   * The steps are cumulative subsets, so each conversion is a share of the step
   * above rather than of the total — which is the reading a funnel implies.
   */
  async funnel(days = 30): Promise<FunnelStep[]> {
    const to = wibDayBounds(new Date()).start;
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);

    const signedUp = await this.prisma.user.count({
      where: { createdAt: { gte: from } },
    });
    const onboarded = await this.prisma.userProfile.count({
      where: { user: { createdAt: { gte: from } } },
    });
    const posted = await this.prisma.curhatPost
      .findMany({
        where: { author: { createdAt: { gte: from } }, status: 'published' },
        distinct: ['authorId'],
        select: { authorId: true },
      })
      .then((rows) => rows.length);
    const activated = await this.prisma.analyticsDaily
      .findMany({ where: { date: { gte: from, lte: to } }, select: { activatedUsers: true } })
      .then((rows) => rows.reduce((total, row) => total + row.activatedUsers, 0));

    const steps = [
      { step: 'signup', count: signedUp },
      { step: 'onboarded', count: onboarded },
      { step: 'posted_curhat', count: posted },
      { step: 'activated', count: activated },
    ];

    return steps.map((step, index) => ({
      ...step,
      conversion:
        index === 0
          ? null
          : steps[index - 1]!.count > 0
            ? round(step.count / steps[index - 1]!.count, 4)
            : null,
    }));
  }

  /**
   * D1/D7/D30 retention per signup cohort.
   *
   * "Retained on day N" means a session was issued on that day — the cheapest
   * signal that somebody came back, and one that does not require reading
   * anything they did.
   */
  async retention(cohorts = 14): Promise<RetentionRow[]> {
    const today = wibDayBounds(new Date()).start;
    const rows: RetentionRow[] = [];

    for (let offset = cohorts; offset >= 1; offset -= 1) {
      const cohortStart = new Date(today.getTime() - offset * 86_400_000);
      const cohortEnd = new Date(cohortStart.getTime() + 86_400_000);

      const cohort = await this.prisma.user.findMany({
        where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
        select: { id: true },
      });

      if (cohort.length === 0) continue;

      const ids = cohort.map((user) => user.id);
      const [d1, d7, d30] = await Promise.all([
        this.returnedOnDay(ids, cohortStart, 1),
        this.returnedOnDay(ids, cohortStart, 7),
        this.returnedOnDay(ids, cohortStart, 30),
      ]);

      rows.push({
        cohortDate: dateKey(cohortStart),
        cohortSize: cohort.length,
        d1: round(d1 / cohort.length, 4),
        d7: round(d7 / cohort.length, 4),
        d30: round(d30 / cohort.length, 4),
      });
    }

    return rows;
  }

  // --- Per-day helpers -----------------------------------------------------

  /**
   * Felt Heard for one day — PRD §19.1, and the definition that must not drift.
   *
   * `(yes + somewhat) / answered`. Dismissed prompts are counted separately and
   * never appear in the denominator: including them would make the North Star
   * measure interruption rather than whether anyone felt heard.
   */
  private async feltHeardForDay(
    start: Date,
    end: Date,
  ): Promise<{ answered: number; positive: number; dismissed: number }> {
    const [answered, positive, dismissed] = await Promise.all([
      this.prisma.feltHeardFeedback.count({
        where: { createdAt: { gte: start, lt: end }, answer: { in: ['yes', 'somewhat', 'no'] } },
      }),
      this.prisma.feltHeardFeedback.count({
        where: { createdAt: { gte: start, lt: end }, answer: { in: ['yes', 'somewhat'] } },
      }),
      // Dismissal has no timestamp of its own, so the prompt's `shownAt` day is
      // used. Close enough for a daily figure — a prompt is dismissed in the
      // same sitting it appears, not days later — and it is the honest bound
      // available without adding a column.
      this.prisma.feltHeardPrompt.count({
        where: { dismissed: true, shownAt: { gte: start, lt: end } },
      }),
    ]);

    return { answered, positive, dismissed };
  }

  private async aiUsageForDay(
    start: Date,
    end: Date,
  ): Promise<{ costUsd: number; callCount: number }> {
    const aggregate = await this.prisma.aiUsageEvent.aggregate({
      where: { createdAt: { gte: start, lt: end } },
      _sum: { costEstimate: true },
      _count: { _all: true },
    });

    return {
      costUsd: aggregate._sum.costEstimate ?? 0,
      callCount: aggregate._count._all,
    };
  }

  /**
   * Users who signed up on this day and reached a meaningful action within 24h.
   *
   * PRD §19.1: at least one of a published curhat, a comment, a DONG AI
   * conversation with ≥4 user messages, or a completed listener session in
   * either role. **Reactions do not count** — too cheap to signal engagement.
   */
  private async activatedUsersForDay(start: Date, end: Date): Promise<number> {
    const cohort = await this.prisma.user.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { id: true, createdAt: true },
    });

    if (cohort.length === 0) return 0;

    let activated = 0;

    for (const user of cohort) {
      const deadline = new Date(user.createdAt.getTime() + ACTIVATION_WINDOW_MS);

      const [posts, comments, sessions, aiMessages] = await Promise.all([
        this.prisma.curhatPost.count({
          where: { authorId: user.id, status: 'published', publishedAt: { lte: deadline } },
        }),
        this.prisma.comment.count({
          where: { authorId: user.id, status: 'published', createdAt: { lte: deadline } },
        }),
        this.prisma.listenerSession.count({
          where: {
            OR: [{ requesterId: user.id }, { listenerId: user.id }],
            endedAt: { not: null, lte: deadline },
          },
        }),
        this.prisma.aiMessage.count({
          where: {
            role: 'user',
            createdAt: { lte: deadline },
            conversation: { userId: user.id },
          },
        }),
      ]);

      if (posts > 0 || comments > 0 || sessions > 0 || aiMessages >= ACTIVATION_AI_MESSAGES) {
        activated += 1;
      }
    }

    return activated;
  }

  /**
   * Response rate and time-to-first-response for posts published on this day.
   *
   * Comments only. A reaction is not a response (E06-T06) — a post with twelve
   * taps and no words has not been answered, and counting them would bury
   * exactly the posts still waiting for a human.
   */
  private async responseMetricsForDay(
    start: Date,
    end: Date,
  ): Promise<{ withResponse24h: number; medianSeconds: number | null }> {
    const posts = await this.prisma.curhatPost.findMany({
      where: { publishedAt: { gte: start, lt: end }, status: 'published' },
      select: { id: true, authorId: true, publishedAt: true },
    });

    if (posts.length === 0) return { withResponse24h: 0, medianSeconds: null };

    let withResponse24h = 0;
    const gaps: number[] = [];

    for (const post of posts) {
      const first = await this.prisma.comment.findFirst({
        where: {
          postId: post.id,
          status: 'published',
          // Replying to your own curhat is not being heard (E06-T06).
          authorId: { not: post.authorId },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      if (!first || !post.publishedAt) continue;

      const seconds = Math.round((first.createdAt.getTime() - post.publishedAt.getTime()) / 1000);
      gaps.push(seconds);
      if (seconds <= 86_400) withResponse24h += 1;
    }

    gaps.sort((a, b) => a - b);

    return {
      withResponse24h,
      medianSeconds: gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)]! : null,
    };
  }

  /** Response coverage: any human response, no time limit (PRD §19.1). */
  private async responseCoverage(): Promise<number | null> {
    const [published, withResponse] = await Promise.all([
      this.prisma.curhatPost.count({ where: { status: 'published' } }),
      this.prisma.curhatPost.count({ where: { status: 'published', responseCount: { gt: 0 } } }),
    ]);

    return published > 0 ? round(withResponse / published, 4) : null;
  }

  private async activeUserCount(from: Date, to: Date): Promise<number> {
    const sessions = await this.prisma.userSession.findMany({
      where: { createdAt: { gte: from, lt: to } },
      distinct: ['userId'],
      select: { userId: true },
    });
    return sessions.length;
  }

  private async returnedOnDay(
    userIds: string[],
    cohortStart: Date,
    dayOffset: number,
  ): Promise<number> {
    const dayStart = new Date(cohortStart.getTime() + dayOffset * 86_400_000);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    // A future day has not happened yet; reporting 0 would read as churn.
    if (dayStart > new Date()) return 0;

    const sessions = await this.prisma.userSession.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: dayStart, lt: dayEnd } },
      distinct: ['userId'],
      select: { userId: true },
    });

    return sessions.length;
  }

  /**
   * Days in the range with no snapshot.
   *
   * Surfaced rather than silently treated as zero: a gap means the aggregation
   * job did not run, and a chart that draws a zero for it looks like a day when
   * nobody used the product.
   */
  private missingDays(from: Date, to: Date, present: string[]): string[] {
    const have = new Set(present);
    const missing: string[] = [];

    for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + 86_400_000)) {
      const key = dateKey(cursor);
      if (!have.has(key)) missing.push(key);
    }

    return missing;
  }
}

/** WIB day bounds as UTC instants, matching every other daily boundary. */
function wibDayBounds(at: Date): { start: Date; end: Date; key: string } {
  const key = wibDayKey(at);
  const start = new Date(`${key}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 86_400_000), key };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
