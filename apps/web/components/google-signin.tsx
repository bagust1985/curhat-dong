'use client';

import { useEffect, useRef } from 'react';

/**
 * "Lanjut dengan Google" — E15-T06, E03-T06.
 *
 * Google Identity Services returns an id token to the browser; the API verifies
 * it against Google's keys server-side. The token is passed straight to
 * `/auth/google` and never stored.
 *
 * Hidden entirely when no client id is configured. A button that opens a broken
 * Google popup is worse than no button.
 */

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleApi {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: { theme?: string; size?: string; text?: string; width?: number; locale?: string },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleApi;
  }
}

export function googleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return id && id.length > 0 ? id : null;
}

export function GoogleSignIn({ onCredential }: { onCredential: (idToken: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const clientId = googleClientId();

  useEffect(() => {
    if (!clientId || !holder.current) return;
    let cancelled = false;
    const element = holder.current;

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement('script');

    const render = () => {
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(element, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        locale: 'id',
      });
    };

    if (existing) {
      render();
    } else {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);

  if (!clientId) return null;

  return <div ref={holder} data-testid="google-signin" />;
}
