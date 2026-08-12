/**
 * Feed performance benchmark — E05-T12, TECH-SPEC §8.3.
 *
 * Target: p95 under 500 ms for the feed queries on a realistic dataset.
 *
 * Seeds synthetic posts, runs each feed query many times, and reports the
 * percentiles plus the query plan. The plan matters as much as the timing: a
 * fast query on 50k rows that is doing a sequential scan will not stay fast.
 *
 * Usage: pnpm --filter @curhat/database benchmark [postCount]
 */

import { config } from 'dotenv';
import { join } from 'node:path';

import { createPrismaClient } from '../src/client.js';

config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

const prisma = createPrismaClient(databaseUrl);

const POST_COUNT = Number(process.argv[2] ?? 50_000);
const ITERATIONS = 60;
const BENCHMARK_MARKER = '[benchmark]';

const MOODS = ['sedih', 'marah', 'cemas', 'capek', 'kosong', 'lega'] as const;
const INTENTS = ['cuma_didengar', 'butuh_saran', 'butuh_dukungan'] as const;

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] as number;
}

async function measure(label: string, run: () => Promise<unknown>): Promise<void> {
  // Warm-up excluded: the first call pays for connection setup and plan
  // caching, which is not what a live request would pay.
  await run();

  const timings: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const started = process.hrtime.bigint();
    await run();
    timings.push(Number(process.hrtime.bigint() - started) / 1e6);
  }

  timings.sort((a, b) => a - b);
  const p50 = percentile(timings, 50);
  const p95 = percentile(timings, 95);
  const verdict = p95 < 500 ? 'OK' : 'OVER TARGET';

  console.warn(
    `  ${label.padEnd(28)} p50 ${p50.toFixed(1).padStart(7)}ms   ` +
      `p95 ${p95.toFixed(1).padStart(7)}ms   ${verdict}`,
  );
}

async function seed(authorId: string, categoryIds: string[]): Promise<void> {
  const existing = await prisma.curhatPost.count({
    where: { body: { startsWith: BENCHMARK_MARKER } },
  });

  if (existing >= POST_COUNT) {
    console.warn(`  ${existing} benchmark posts already present.`);
    return;
  }

  const toCreate = POST_COUNT - existing;
  console.warn(`  seeding ${toCreate} posts…`);

  const batchSize = 2_000;
  const now = Date.now();

  for (let offset = 0; offset < toCreate; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, toCreate - offset) }, (_, i) => {
      const n = offset + i;
      return {
        authorId,
        categoryId: categoryIds[n % categoryIds.length] as string,
        body: `${BENCHMARK_MARKER} curhat sintetis nomor ${n} untuk mengukur performa feed.`,
        mood: MOODS[n % MOODS.length] as (typeof MOODS)[number],
        intent: INTENTS[n % INTENTS.length] as (typeof INTENTS)[number],
        status: 'published' as const,
        safetyLevel: (n % 10 === 0 ? 'L1' : 'L0') as 'L0' | 'L1',
        responseCount: n % 5,
        // Spread over 90 days so the 48-hour window is a real filter rather
        // than matching everything.
        createdAt: new Date(now - (n % (90 * 24)) * 3_600_000),
      };
    });

    await prisma.curhatPost.createMany({ data: batch });
  }
}

async function explain(label: string, sql: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
  );
  const plan = rows.map((row) => Object.values(row)[0] ?? '').join('\n');
  const usesSeqScan = /Seq Scan on curhat_posts/.test(plan);

  console.warn(`  ${label.padEnd(28)} ${usesSeqScan ? 'SEQ SCAN — needs an index' : 'index used'}`);
}

async function main(): Promise<void> {
  console.warn(`Feed benchmark — target p95 < 500ms (TECH-SPEC §8.3)\n`);

  const categories = await prisma.postCategory.findMany({ select: { id: true } });
  if (categories.length === 0) throw new Error('Run the seed first.');

  const author = await prisma.user.create({ data: {} });

  try {
    await seed(
      author.id,
      categories.map((c) => c.id),
    );

    const cutoff = new Date(Date.now() - 48 * 3_600_000);

    console.warn('\nTimings:');

    await measure('feed: terbaru', () =>
      prisma.curhatPost.findMany({
        where: { status: 'published' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: {
          category: { select: { slug: true } },
          anonymousIdentity: { select: { displayCode: true } },
          author: { select: { profile: { select: { alias: true } } } },
          _count: { select: { comments: true } },
        },
      }),
    );

    await measure('feed: butuh-didengar', () =>
      prisma.curhatPost.findMany({
        where: { status: 'published', responseCount: { lt: 2 }, createdAt: { gte: cutoff } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: { category: { select: { slug: true } }, _count: { select: { comments: true } } },
      }),
    );

    const firstCategoryId = categories[0]?.id ?? '';

    await measure('feed: topik', () =>
      prisma.curhatPost.findMany({
        where: { status: 'published', categoryId: firstCategoryId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: { category: { select: { slug: true } }, _count: { select: { comments: true } } },
      }),
    );

    await measure('feed: page 50 (deep cursor)', () =>
      prisma.curhatPost.findMany({
        where: { status: 'published', createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );

    console.warn('\nQuery plans:');

    await explain(
      'feed: terbaru',
      `SELECT * FROM curhat_posts WHERE status = 'published'
       ORDER BY created_at DESC, id DESC LIMIT 21`,
    );

    await explain(
      'feed: butuh-didengar',
      `SELECT * FROM curhat_posts WHERE status = 'published' AND response_count < 2
       AND created_at >= now() - interval '48 hours'
       ORDER BY created_at DESC, id DESC LIMIT 21`,
    );

    const total = await prisma.curhatPost.count();
    console.warn(`\nDataset: ${total} posts total.`);
  } finally {
    await prisma.curhatPost.deleteMany({ where: { authorId: author.id } });
    await prisma.user.delete({ where: { id: author.id } });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
