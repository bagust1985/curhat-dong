'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, api, refreshSession, setAccessToken } from './api';

/**
 * Who is signed in — E15-T06.
 *
 * Mirrors `OwnProfile` from the API. Note what is not here and never will be:
 * email, provider id, phone, risk score or trust score. The API does not send
 * them (CLAUDE.md non-negotiable #4) and the client has no field to put them in.
 */
export interface SessionUser {
  alias: string;
  avatar: string | null;
  bio: string | null;
  isListener: boolean;
  joinedAt: string;
  helpfulCount: number;
  hasCompletedOnboarding: boolean;
  topics: string[];
}

export type SessionStatus =
  /** Still asking the refresh cookie whether there is a session. */
  | 'loading'
  | 'anonymous'
  /** Signed in, but has not finished onboarding — E04. */
  | 'onboarding'
  | 'authenticated';

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Called after a successful login, with the access token from the response. */
  signedIn: (accessToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

async function loadUser(): Promise<{ status: SessionStatus; user: SessionUser | null }> {
  try {
    const { data } = await api<SessionUser>('/me');
    return { status: 'authenticated', user: data };
  } catch (error) {
    // 404 from /me means authenticated but not onboarded — the API says so
    // explicitly rather than inventing a half-user.
    if (error instanceof ApiError && error.status === 404) {
      return { status: 'onboarding', user: null };
    }
    return { status: 'anonymous', user: null };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: SessionStatus; user: SessionUser | null }>({
    status: 'loading',
    user: null,
  });

  const reload = useCallback(async () => {
    setState(await loadUser());
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // A reload starts with no access token in memory by design; the HttpOnly
      // refresh cookie is the only thing that survives, so ask it first.
      const refreshed = await refreshSession();
      if (cancelled) return;
      if (!refreshed) {
        setState({ status: 'anonymous', user: null });
        return;
      }
      const next = await loadUser();
      if (!cancelled) setState(next);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = useCallback(async (accessToken: string) => {
    setAccessToken(accessToken);
    setState(await loadUser());
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      // Already invalid server-side is still signed out here. Leaving the user
      // on a screen that looks logged-in would be the worse failure.
    }
    setAccessToken(null);
    setState({ status: 'anonymous', user: null });
  }, []);

  const value = useMemo<SessionState>(
    () => ({ ...state, signedIn, signOut, reload }),
    [state, signedIn, signOut, reload],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession harus dipakai di dalam SessionProvider');
  return context;
}
