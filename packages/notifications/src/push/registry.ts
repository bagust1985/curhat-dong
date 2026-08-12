/**
 * Provider selection — E12-T02.
 *
 * The one place that decides which adapter a device's `push_provider` maps to.
 * Everything above it addresses devices, not services.
 */

import { createExpoPushProvider } from './expo.provider.js';
import { createFcmProvider } from './fcm.provider.js';
import { createWebPushProvider } from './webpush.provider.js';
import { unavailableProvider, type PushProvider, type PushProviderName } from './provider.js';

export interface PushRegistryConfig {
  /** Which provider a newly registered mobile device is issued (TECH-SPEC §6.1). */
  mobileProvider: 'expo' | 'fcm';
  expoAccessToken?: string | undefined;
  fcmProjectId?: string | undefined;
  fcmServiceAccountJson?: string | undefined;
  vapidPublicKey?: string | undefined;
  vapidPrivateKey?: string | undefined;
  vapidSubject?: string | undefined;
  fetchImpl?: typeof fetch;
}

export interface PushRegistry {
  /** Provider to register a new device of this platform with. */
  readonly mobileProvider: 'expo' | 'fcm';
  get(name: PushProviderName): PushProvider;
  /** Names that are ready to send right now. */
  configuredNames(): PushProviderName[];
}

export function createPushRegistry(config: PushRegistryConfig): PushRegistry {
  const providers: Record<PushProviderName, PushProvider> = {
    expo: createExpoPushProvider({
      accessToken: config.expoAccessToken,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    }),
    fcm: createFcmProvider({
      serviceAccountJson: config.fcmServiceAccountJson,
      projectId: config.fcmProjectId,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    }),
    webpush: createWebPushProvider({
      publicKey: config.vapidPublicKey,
      privateKey: config.vapidPrivateKey,
      subject: config.vapidSubject,
    }),
  };

  return {
    mobileProvider: config.mobileProvider,

    get(name) {
      return providers[name] ?? unavailableProvider(name, 'unknown_provider');
    },

    configuredNames() {
      return (Object.keys(providers) as PushProviderName[]).filter(
        (name) => providers[name].configured,
      );
    },
  };
}
