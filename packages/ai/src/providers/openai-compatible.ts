import { AiProviderError } from '../errors.js';
import type { AiProviderName, ChatChunk, TokenUsage } from '../types.js';
import { BaseAiProvider, type CompletionRequest, type CompletionResponse } from './base.js';
import { postJson, readSseData, type FetchLike } from './http.js';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export interface OpenAiCompatibleOptions {
  /** Optional: a self-hosted server may not require one. */
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  fetchImpl?: FetchLike | undefined;
  /** Reported on results and usage events. */
  name?: AiProviderName;
}

/**
 * OpenAI chat-completions adapter — E08-T02.
 *
 * The same class serves the hosted API and any self-hosted server that speaks
 * the chat-completions shape (vLLM, Ollama, LM Studio); only the base URL and
 * the reported provider name differ. That is the whole point of keeping the
 * gateway provider-agnostic: a local model is a config change.
 */
export class OpenAiCompatibleProvider extends BaseAiProvider {
  readonly name: AiProviderName;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: OpenAiCompatibleOptions = {}) {
    super();
    this.name = options.name ?? 'openai';
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));

    if (this.name === 'openai' && !options.apiKey) {
      throw new AiProviderError('not_configured', 'openai', 'OPENAI_API_KEY is not set');
    }
  }

  protected async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await postJson({
      url: `${this.baseUrl}/chat/completions`,
      headers: this.headers(),
      body: this.payload(request, false),
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      provider: this.name,
      fetchImpl: this.fetchImpl,
    });

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: body.choices?.[0]?.message?.content ?? '',
      usage: readUsage(body.usage),
    };
  }

  protected async *streamChat(request: CompletionRequest): AsyncIterable<ChatChunk> {
    const response = await postJson({
      url: `${this.baseUrl}/chat/completions`,
      headers: this.headers(),
      body: this.payload(request, true),
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      provider: this.name,
      fetchImpl: this.fetchImpl,
    });

    const usage: TokenUsage = { tokensIn: 0, tokensOut: 0 };

    for await (const data of readSseData(response)) {
      if (data === '[DONE]') break;

      let event: OpenAiStreamEvent;
      try {
        event = JSON.parse(data) as OpenAiStreamEvent;
      } catch {
        continue;
      }

      const delta = event.choices?.[0]?.delta?.content;
      if (delta) yield { text: delta };

      if (event.usage) Object.assign(usage, readUsage(event.usage));
    }

    yield { text: '', done: true, usage };
  }

  private headers(): Record<string, string> {
    return this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {};
  }

  private payload(request: CompletionRequest, stream: boolean): Record<string, unknown> {
    return {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: [
        { role: 'system', content: request.system },
        ...request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      // Usage is not reported on streamed responses unless it is asked for,
      // and a chat turn with no token count is a hole in the cost log.
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }
}

interface OpenAiStreamEvent {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function readUsage(usage?: { prompt_tokens?: number; completion_tokens?: number }): TokenUsage {
  return {
    tokensIn: usage?.prompt_tokens ?? 0,
    tokensOut: usage?.completion_tokens ?? 0,
  };
}
