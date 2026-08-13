'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile — E15-T06, E03-T07.
 *
 * Rendered only when the API asks for it (`AUTH_TURNSTILE_REQUIRED`), which
 * happens after an anomaly threshold rather than on every attempt: making
 * everyone prove they are human on their first try is a tax on the people who
 * are, and the server decides, not this component.
 *
 * The token proves nothing on its own — the API verifies it with Cloudflare
 * server-side (turnstile.service.ts). This is the widget, not the check.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: (() => void) | undefined;
      'expired-callback'?: (() => void) | undefined;
      theme?: 'auto' | 'light' | 'dark';
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(script);
  });
}

export interface TurnstileProps {
  onToken: (token: string) => void;
  onError?: () => void;
}

export function Turnstile({ onToken, onError }: TurnstileProps) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !holder.current) return;
    let cancelled = false;
    const element = holder.current;

    void loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId.current = window.turnstile.render(element, {
          sitekey: siteKey,
          callback: onToken,
          'error-callback': onError,
          'expired-callback': onError,
        });
      })
      .catch(() => onError?.());

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, onToken, onError]);

  if (!siteKey) {
    // No key configured (local dev). Say so rather than rendering an empty box
    // the user is being asked to interact with.
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Verifikasi bot belum aktif di lingkungan ini.
      </p>
    );
  }

  return <div ref={holder} className="mt-4" data-testid="turnstile" />;
}
