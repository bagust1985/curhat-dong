import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * Peak-night load test — E17-T13. PRD §22.
 *
 * The scenario is the one this product actually has: usage climbs in the
 * evening and peaks between 21:00 and 04:00 (DESIGN-REF §0). Testing a flat
 * midday load would measure a shape the product never takes.
 *
 * Targets, from the task:
 *   API p95 < 500ms · chat delivery < 2s · feed usable in 2–3s · 99.5% up
 *
 * Run against staging on the production spec (4 vCPU / 8 GB), never against
 * production: this writes posts, and they would be real rows in a real feed.
 *
 *   k6 run -e BASE_URL=https://api.staging.curhatdong.com -e TOKEN=... peak-night.js
 */

const feedLatency = new Trend('feed_latency', true);
const postLatency = new Trend('post_latency', true);

const BASE = __ENV.BASE_URL || 'http://localhost:3101';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  scenarios: {
    // The evening ramp: quiet at 20:00, busy by 22:00, still busy at 01:00.
    peak_night: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '2m', target: 30 },
        { duration: '5m', target: 120 },
        { duration: '10m', target: 120 },
        { duration: '3m', target: 20 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Fails the run rather than printing a number somebody has to interpret.
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.005'],
    feed_latency: ['p(95)<3000'],
    post_latency: ['p(95)<1500'],
  },
};

const headers = () => ({
  'content-type': 'application/json',
  'x-client-platform': 'web',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
});

export default function () {
  // Reading is what most people do most of the time; the mix reflects that
  // rather than hammering the write path because it is more interesting.
  const feed = http.get(`${BASE}/v1/feed?tab=terbaru&limit=20`, { headers: headers() });
  feedLatency.add(feed.timings.duration);
  check(feed, { 'feed 200': (r) => r.status === 200 });

  sleep(Math.random() * 3 + 1);

  if (Math.random() < 0.15) {
    const post = http.post(
      `${BASE}/v1/posts`,
      JSON.stringify({
        body: 'Uji beban malam. Baris ini bukan curhat sungguhan dan boleh dihapus.',
        categorySlug: 'lainnya',
        mood: 'capek',
        intent: 'cuma_didengar',
        anonymityMode: 'anonymous',
      }),
      { headers: headers() },
    );
    postLatency.add(post.timings.duration);
    // 201 or a rate limit are both correct answers; a 500 is not.
    check(post, { 'post tidak 5xx': (r) => r.status < 500 });
  }

  sleep(Math.random() * 4 + 2);
}
