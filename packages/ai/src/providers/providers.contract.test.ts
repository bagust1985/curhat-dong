import { describe, expect, it } from 'vitest';

import { AiProviderError } from '../errors.js';
import { BUILTIN_PROMPTS } from '../prompts.js';
import type { AIProvider, AiCallOptions } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import type { FetchLike } from './http.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';

/**
 * One contract, run against every adapter — E08-T02.
 *
 * The whole promise of the gateway is that swapping providers changes nothing
 * for the caller. That promise is only worth something if the same assertions
 * hold for each adapter, which is what this file does.
 */

interface Fixture {
  name: string;
  create: (fetchImpl: FetchLike) => AIProvider;
  completion: (text: string) => unknown;
  streamFrames: (deltas: string[]) => string[];
}

const FIXTURES: Fixture[] = [
  {
    name: 'anthropic',
    create: (fetchImpl) => new AnthropicProvider({ apiKey: 'test-key', fetchImpl }),
    completion: (text) => ({
      content: [{ type: 'text', text }],
      usage: { input_tokens: 120, output_tokens: 34 },
    }),
    streamFrames: (deltas) => [
      JSON.stringify({
        type: 'message_start',
        message: { usage: { input_tokens: 11, output_tokens: 0 } },
      }),
      ...deltas.map((text) =>
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } }),
      ),
      JSON.stringify({ type: 'message_delta', usage: { output_tokens: 5 } }),
    ],
  },
  {
    name: 'openai-compatible',
    create: (fetchImpl) =>
      new OpenAiCompatibleProvider({ apiKey: 'test-key', fetchImpl, name: 'openai' }),
    completion: (text) => ({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 120, completion_tokens: 34 },
    }),
    streamFrames: (deltas) => [
      ...deltas.map((content) => JSON.stringify({ choices: [{ delta: { content } }] })),
      JSON.stringify({ usage: { prompt_tokens: 11, completion_tokens: 5 } }),
      '[DONE]',
    ],
  },
];

function jsonResponse(body: unknown): FetchLike {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function errorResponse(status: number): FetchLike {
  return () => Promise.resolve(new Response('{"error":"nope"}', { status }));
}

function sseResponse(frames: string[]): FetchLike {
  return () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
        }
        controller.close();
      },
    });

    return Promise.resolve(new Response(stream, { status: 200 }));
  };
}

const options = (key: keyof typeof BUILTIN_PROMPTS): AiCallOptions => ({
  model: 'test-model',
  tier: 'cheap',
  prompt: BUILTIN_PROMPTS[key],
  timeoutMs: 5_000,
});

describe.each(FIXTURES)('$name adapter contract', (fixture) => {
  it('parses a risk assessment and reports token usage the same way', async () => {
    const provider = fixture.create(
      jsonResponse(
        fixture.completion(
          '{"riskScores":{"self_harm":0.72,"toxicity":0.1},"ambiguous":true,"emotion":"sedih"}',
        ),
      ),
    );

    const result = await provider.assessRisk('aku capek banget', options('safety.assess_risk'));

    expect(result.value.riskScores).toEqual({ toxicity: 0.1, self_harm: 0.72 });
    expect(result.value.ambiguous).toBe(true);
    expect(result.value.emotion).toBe('sedih');
    expect(result.meta.usage).toEqual({ tokensIn: 120, tokensOut: 34 });
    expect(result.meta.model).toBe('test-model');
  });

  it('tolerates a fenced JSON answer', async () => {
    const provider = fixture.create(
      jsonResponse(
        fixture.completion('Here you go:\n```json\n{"flagged":true,"categories":{"hate":0.9}}\n```'),
      ),
    );

    const result = await provider.moderate('...', options('safety.moderate'));

    expect(result.value).toEqual({ flagged: true, categories: { hate: 0.9 } });
  });

  it('clamps out-of-range scores and drops invented categories', async () => {
    const provider = fixture.create(
      jsonResponse(
        fixture.completion('{"riskScores":{"self_harm":3,"vibes":0.9,"threat":-1}}'),
      ),
    );

    const result = await provider.assessRisk('...', options('safety.assess_risk'));

    expect(result.value.riskScores).toEqual({ threat: 0, self_harm: 1 });
  });

  it('raises invalid_response rather than returning an empty verdict', async () => {
    const provider = fixture.create(jsonResponse(fixture.completion('I would rather not.')));

    await expect(provider.assessRisk('...', options('safety.assess_risk'))).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  it.each([
    [429, 'rate_limit', true],
    [500, 'server_error', true],
    [401, 'auth', false],
    [400, 'bad_request', false],
  ])('normalises HTTP %i to %s', async (status, kind, retryable) => {
    const provider = fixture.create(errorResponse(status));

    const error = await provider
      .classifyEmotion('...', options('classify.emotion'))
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ kind });
    expect((error as AiProviderError).retryable).toBe(retryable);
  });

  it('streams chat text and closes with usage', async () => {
    const provider = fixture.create(sseResponse(fixture.streamFrames(['Hai', ', ada apa?'])));

    const chunks: string[] = [];
    let finalUsage: { tokensIn: number; tokensOut: number } | undefined;

    for await (const chunk of provider.chat(
      { messages: [{ role: 'user', content: 'halo' }] },
      options('chat.system'),
    )) {
      if (chunk.text) chunks.push(chunk.text);
      if (chunk.done) finalUsage = chunk.usage;
    }

    expect(chunks.join('')).toBe('Hai, ada apa?');
    expect(finalUsage).toEqual({ tokensIn: 11, tokensOut: 5 });
  });

  it('summarises history through the same parsing path', async () => {
    const provider = fixture.create(
      jsonResponse(fixture.completion('{"summary":"dia bercerita soal pekerjaan"}')),
    );

    const result = await provider.summarize('...', options('chat.summarize'));

    expect(result.value.summary).toBe('dia bercerita soal pekerjaan');
  });

  it('sends no API key back to the caller', async () => {
    const provider = fixture.create(jsonResponse(fixture.completion('{"intent":"mau_cerita"}')));

    const result = await provider.detectIntent('...', options('classify.intent'));

    expect(JSON.stringify(result)).not.toContain('test-key');
  });
});
