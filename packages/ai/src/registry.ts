import { AiProviderError } from './errors.js';
import { AnthropicProvider } from './providers/anthropic.js';
import type { FetchLike } from './providers/http.js';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.js';
import type { AIProvider, AiProviderName } from './types.js';

/**
 * Provider selection from runtime config — E08-T01.
 *
 * Credentials enter here and stop here. Nothing in this module is exported to
 * domain code, and no result type carries a key, base URL or header — the
 * requirement in TECH-SPEC §4.4 that a provider API key is never sent to a
 * client is enforced by there being nothing to send.
 */

export interface ProviderCredentials {
  anthropicApiKey?: string | undefined;
  anthropicBaseUrl?: string | undefined;
  openaiApiKey?: string | undefined;
  openaiBaseUrl?: string | undefined;
  /** Self-hosted, OpenAI-compatible endpoint. */
  localBaseUrl?: string | undefined;
  localApiKey?: string | undefined;
  /** Test seam. */
  fetchImpl?: FetchLike | undefined;
}

export function createProvider(
  name: AiProviderName,
  credentials: ProviderCredentials,
): AIProvider {
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: credentials.anthropicApiKey ?? '',
        ...(credentials.anthropicBaseUrl ? { baseUrl: credentials.anthropicBaseUrl } : {}),
        ...(credentials.fetchImpl ? { fetchImpl: credentials.fetchImpl } : {}),
      });

    case 'openai':
      return new OpenAiCompatibleProvider({
        apiKey: credentials.openaiApiKey,
        baseUrl: credentials.openaiBaseUrl,
        fetchImpl: credentials.fetchImpl,
        name: 'openai',
      });

    case 'local':
      if (!credentials.localBaseUrl) {
        throw new AiProviderError('not_configured', 'local', 'AI_LOCAL_BASE_URL is not set');
      }
      return new OpenAiCompatibleProvider({
        apiKey: credentials.localApiKey,
        baseUrl: credentials.localBaseUrl,
        fetchImpl: credentials.fetchImpl,
        name: 'local',
      });
  }
}

/**
 * What the gateway needs from provider selection.
 *
 * Narrower than the class so a test can substitute a scripted provider without
 * a network, an API key, or a subclass of something it does not own.
 */
export interface ProviderResolver {
  get(name: AiProviderName): AIProvider;
  /** Providers to try, in order. */
  order(): AiProviderName[];
}

export interface RegistryOptions {
  primary: AiProviderName;
  /** Used when the primary is exhausted or its circuit is open (E08-T08). */
  fallback?: AiProviderName | undefined;
  credentials: ProviderCredentials;
}

/**
 * Lazily builds and caches providers.
 *
 * Construction is deferred so a missing key for the *fallback* provider does
 * not stop the process from booting with a perfectly working primary.
 */
export class ProviderRegistry implements ProviderResolver {
  private readonly cache = new Map<AiProviderName, AIProvider>();

  constructor(private readonly options: RegistryOptions) {}

  get(name: AiProviderName): AIProvider {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const provider = createProvider(name, this.options.credentials);
    this.cache.set(name, provider);
    return provider;
  }

  /** Primary first, then the fallback when one is configured and different. */
  order(): AiProviderName[] {
    const { primary, fallback } = this.options;
    return fallback && fallback !== primary ? [primary, fallback] : [primary];
  }
}
