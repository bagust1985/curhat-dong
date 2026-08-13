import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiError,
  api,
  restoreSession,
  setSessionEndedHandler,
  signOutLocally,
  storeTokens,
  type SessionEndedError,
} from './api';

/**
 * Who is signed in — E16-T03.
 *
 * Same shape as the web session, and the same omissions: no email, no provider
 * id, no phone, no internal score. The API does not send them (non-negotiable
 * #4) and there is no field here to put them in.
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

export type SessionStatus = 'loading' | 'anonymous' | 'onboarding' | 'authenticated';

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Set when a session ended by itself — shown on the login screen. */
  endedMessage: string | null;
  signedIn: (tokens: { accessToken: string; refreshToken?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  clearEndedMessage: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

async function loadUser(): Promise<{ status: SessionStatus; user: SessionUser | null }> {
  try {
    const { data } = await api<SessionUser>('/me');
    return { status: 'authenticated', user: data };
  } catch (error) {
    // 404 means authenticated but not onboarded — the API says so explicitly
    // rather than inventing a half-user.
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
  const [endedMessage, setEndedMessage] = useState<string | null>(null);

  useEffect(() => {
    // Any request can discover that the session is gone — a rotated token
    // replayed, a session revoked from another device. The message is kept so
    // the login screen can say why rather than just appearing.
    setSessionEndedHandler((error: SessionEndedError) => {
      setEndedMessage(error.message);
      setState({ status: 'anonymous', user: null });
    });
    return () => setSessionEndedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await restoreSession();
      if (cancelled) return;
      if (!restored) {
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

  const signedIn = useCallback(
    async (tokens: { accessToken: string; refreshToken?: string }) => {
      await storeTokens(tokens);
      setEndedMessage(null);
      setState(await loadUser());
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      // Already invalid server-side is still signed out here.
    }
    await signOutLocally();
    setState({ status: 'anonymous', user: null });
  }, []);

  const reload = useCallback(async () => {
    setState(await loadUser());
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      ...state,
      endedMessage,
      signedIn,
      signOut,
      reload,
      clearEndedMessage: () => setEndedMessage(null),
    }),
    [state, endedMessage, signedIn, signOut, reload],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession harus dipakai di dalam SessionProvider');
  return context;
}
