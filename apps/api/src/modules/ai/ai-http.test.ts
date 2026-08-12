import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AIProvider,
  AiCallOptions,
  AiProviderName,
  AiResult,
  ChatChunk,
  EmotionResult,
  IntentResult,
  ModerationResult,
  ProviderResolver,
  RiskResult,
  SummaryResult,
} from '@curhat/ai';
import type { PrismaClient } from '@curhat/database';

import { AppModule } from '../../app.module.js';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ResponseInterceptor } from '../../common/response.interceptor.js';
import { ENV } from '../../config/env.config.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import { AI_PROVIDER_RESOLVER } from './ai-gateway.service.js';
import { wibDayKey } from './wib-day.js';

config({ path: join(process.cwd(), '../../.env') });

const describeDb = process.env['DATABASE_URL'] ? describe : describe.skip;

/** Minimal provider: two deltas and a usage frame. */
class StubProvider implements AIProvider {
  readonly name: AiProviderName = 'local';

  assessRisk(_input: string, options: AiCallOptions): Promise<AiResult<RiskResult>> {
    return this.answer(options, { riskScores: { self_harm: 0.01 }, ambiguous: false });
  }
  moderate(_input: string, options: AiCallOptions): Promise<AiResult<ModerationResult>> {
    return this.answer(options, { flagged: false, categories: {} });
  }
  classifyEmotion(_input: string, options: AiCallOptions): Promise<AiResult<EmotionResult>> {
    return this.answer(options, { emotion: 'sedih', confidence: 0.5 });
  }
  detectIntent(_input: string, options: AiCallOptions): Promise<AiResult<IntentResult>> {
    return this.answer(options, { intent: 'mau_cerita', confidence: 0.5 });
  }
  summarize(_input: string, options: AiCallOptions): Promise<AiResult<SummaryResult>> {
    return this.answer(options, { summary: 'ringkasan' });
  }

  async *chat(): AsyncIterable<ChatChunk> {
    yield { text: 'Halo, ' };
    yield { text: 'aku dengerin.' };
    yield { text: '', done: true, usage: { tokensIn: 20, tokensOut: 5 } };
  }

  private answer<T>(options: AiCallOptions, value: T): Promise<AiResult<T>> {
    return Promise.resolve({
      value,
      meta: {
        provider: this.name,
        model: options.model,
        usage: { tokensIn: 10, tokensOut: 4 },
        latencyMs: 1,
      },
    });
  }
}

interface SseFrame {
  event: string;
  data: Record<string, unknown>;
}

/** Parses an SSE body into frames, ignoring heartbeat comments. */
function parseSse(body: string): SseFrame[] {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith(':'))
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? '';
      const data = /^data: (.+)$/m.exec(block)?.[1] ?? '{}';
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

describeDb('DONG AI over HTTP (E09-T03)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: Redis;
  let http: ReturnType<typeof request>;

  let token: string;
  let userId: string;
  let conversationId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    Logger.overrideLogger(false);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // The one seam a live account would otherwise be needed for.
      .overrideProvider(AI_PROVIDER_RESOLVER)
      .useValue({ get: () => new StubProvider(), order: () => ['local'] } as ProviderResolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalGuards(
      new JwtAuthGuard(app.get(ENV), app.get(Reflector), app.get(SessionService)),
    );

    await app.init();

    prisma = app.get<PrismaClient>(PRISMA);
    redis = app.get<Redis>(REDIS);
    http = request(app.getHttpServer());

    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);
    userId = user.id;
    token = (await app.get(SessionService).issue(user.id)).accessToken;
  }, 120_000);

  afterAll(async () => {
    await prisma.aiUsageEvent.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await redis.del(`ai:quota:${userId}:${wibDayKey()}`);
    await app.close();
  });

  beforeEach(async () => {
    await redis.del(`ai:quota:${userId}:${wibDayKey()}`);

    const created = await http
      .post('/v1/ai/conversations')
      .set('authorization', `Bearer ${token}`)
      .send({ personalityMode: 'pendengar' })
      .expect(201);

    conversationId = created.body.data.id as string;
  });

  it('serves the personality picker with the permanent disclaimer', async () => {
    const response = await http
      .get('/v1/ai/personalities')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.disclaimer).toBe('DONG AI teman ngobrol, bukan psikolog.');
    expect(response.body.data.modes).toHaveLength(5);
    expect(response.body.data.quota.remaining).toBeGreaterThan(0);
  });

  it('streams the reply as SSE in the documented order', async () => {
    const response = await http
      .post(`/v1/ai/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ body: 'halo, boleh cerita?' })
      .expect(201);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toContain('no-cache');
    // Proxies must not hold the whole reply back and defeat the streaming.
    expect(response.headers['x-accel-buffering']).toBe('no');

    const frames = parseSse(response.text);
    expect(frames.map((frame) => frame.event)).toEqual([
      'message.start',
      'message.delta',
      'message.delta',
      'message.complete',
    ]);

    // Frames are bare events, not the REST envelope — the interceptor is
    // correctly bypassed on this route.
    expect(response.text).not.toContain('"meta"');
    expect(frames.at(-1)?.data['quota']).toMatchObject({ remaining: expect.any(Number) });
  });

  it('refuses with 429 and warm copy before a single byte streams', async () => {
    const limit = 50;
    await redis.set(`ai:quota:${userId}:${wibDayKey()}`, String(limit));

    const response = await http
      .post(`/v1/ai/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ body: 'halo' })
      .expect(429);

    // A normal JSON error, not an SSE error frame.
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.error.code).toBe('AI_QUOTA_EXCEEDED');
    expect(response.body.error.message).toContain('Cari Listener');
  });

  it('rejects an empty message before it reaches the model', async () => {
    await http
      .post(`/v1/ai/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${token}`)
      .send({ body: '   ' })
      .expect(400);
  });

  it('keeps conversations private from other accounts', async () => {
    const other = await prisma.user.create({ data: {} });
    createdUserIds.push(other.id);
    const otherToken = (await app.get(SessionService).issue(other.id)).accessToken;

    await http
      .get(`/v1/ai/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${otherToken}`)
      .expect(404);

    await http
      .post(`/v1/ai/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${otherToken}`)
      .send({ body: 'halo' })
      .expect(404);
  });

  it('requires authentication', async () => {
    await http.get('/v1/ai/conversations').expect(401);
  });
});
