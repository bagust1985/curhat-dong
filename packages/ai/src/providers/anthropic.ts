import { AiProviderError } from '../errors.js';
import type { AiProviderName, ChatChunk, TokenUsage } from '../types.js';
import { BaseAiProvider, type CompletionRequest, type CompletionResponse } from './base.js';
import { postJson, readSseData, type FetchLike } from './http.js';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/**
 * Anthropic Messages API adapter — E08-T02.
 *
 * Sampling parameters are deliberately not sent: they are rejected outright by
 * the newer models, and the classification prompts do their steering in words.
 */
export class AnthropicProvider extends BaseAiProvider {
  readonly name: AiProviderName = 'anthropic';

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: AnthropicProviderOptions) {
    super();
    if (!options.apiKey) {
      throw new AiProviderError('not_configured', 'anthropic', 'ANTHROPIC_API_KEY is not set');
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  protected async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await postJson({
      url: `${this.baseUrl}/v1/messages`,
      headers: this.headers(),
      body: this.payload(request, false),
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      provider: this.name,
      fetchImpl: this.fetchImpl,
    });

    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (body.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');

    return { text, usage: readUsage(body.usage) };
  }

  protected async *streamChat(request: CompletionRequest): AsyncIterable<ChatChunk> {
    const response = await postJson({
      url: `${this.baseUrl}/v1/messages`,
      headers: this.headers(),
      body: this.payload(request, true),
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      provider: this.name,
      fetchImpl: this.fetchImpl,
    });

    const usage: TokenUsage = { tokensIn: 0, tokensOut: 0 };

    for await (const data of readSseData(response)) {
      let event: AnthropicStreamEvent;
      try {
        event = JSON.parse(data) as AnthropicStreamEvent;
      } catch {
        // A malformed frame is not worth failing a live conversation over.
        continue;
      }

      if (event.type === 'message_start' && event.message?.usage) {
        Object.assign(usage, readUsage(event.message.usage));
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { text: event.delta.text ?? '' };
      }

      if (event.type === 'message_delta' && event.usage?.output_tokens !== undefined) {
        usage.tokensOut = event.usage.output_tokens;
      }

      if (event.type === 'error') {
        throw new AiProviderError('server_error', this.name, 'Stream reported an error');
      }
    }

    yield { text: '', done: true, usage };
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.options.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  private payload(request: CompletionRequest, stream: boolean): Record<string, unknown> {
    return {
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(stream ? { stream: true } : {}),
    };
  }
}

interface AnthropicStreamEvent {
  type?: string;
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  delta?: { type?: string; text?: string };
  usage?: { output_tokens?: number };
}

function readUsage(usage?: { input_tokens?: number; output_tokens?: number }): TokenUsage {
  return {
    tokensIn: usage?.input_tokens ?? 0,
    tokensOut: usage?.output_tokens ?? 0,
  };
}
