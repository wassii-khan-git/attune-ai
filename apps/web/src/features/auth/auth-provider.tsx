'use client';

import type { LoginRequest, RegisterRequest, User } from '@attune/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createApi, type Api } from '@/lib/api/endpoints';
import { createHttpClient } from '@/lib/api/http';
import { IDLE_LIMIT_MS, isIdle, startIdleMonitor } from '@/lib/session/idle-monitor';
import { createRefreshCoordinator } from '@/lib/session/refresh-coordinator';
import { createSessionStore, type SessionStore } from '@/lib/session/session-store';

/** Renew this long before the access token expires, so no request meets an expired one. */
const REFRESH_AHEAD_MS = 60_000;

/**
 * Why there is no session, so a page can explain it.
 * - `idle`: 15 minutes passed without input.
 * - `expired`: the session could not be renewed.
 * - `signed-out`: the user signed out, here or in another tab.
 */
export type SignedOutReason = 'idle' | 'expired' | 'signed-out';

export type AuthState =
  /** The first check of an existing session has not finished. */
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; reason?: SignedOutReason };

export type AuthContextValue = {
  state: AuthState;
  /** The API client, wired to renew the session when a request finds it expired. */
  api: Api;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type Session = {
  api: Api;
  store: SessionStore;
  refresh: (observed: number | null) => Promise<void>;
};

/** Builds the client-side session machinery once per page load. Browser only. */
function createSession(): Session {
  const store = createSessionStore(window.localStorage, window);
  // The refresh call itself must not trigger another refresh, so it gets a plain client.
  const plainApi = createApi(createHttpClient());
  const coordinator = createRefreshCoordinator({
    refresh: () => plainApi.auth.refresh(),
    store,
    now: () => Date.now(),
    // Typed as always present, but missing in older browsers.
    locks: (navigator as Partial<Navigator>).locks,
  });
  const refresh = async (observed: number | null): Promise<void> => {
    await coordinator.run(observed);
  };

  const api = createApi(
    createHttpClient({
      onUnauthenticated: async () => {
        try {
          await refresh(store.getAccessExpiry());
          return true;
        } catch {
          return false;
        }
      },
    }),
  );

  return { api, store, refresh };
}

/**
 * Holds who is signed in and keeps the session alive while the user is active.
 *
 * - On load it asks the API whether anyone is signed in. If the access token
 *   has expired but a refresh token remains, it renews the session and asks again.
 * - It renews the session shortly before the access token expires.
 * - After 15 minutes without input in any tab it signs out, and the sign-out
 *   reaches every other tab.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const sessionRef = useRef<Session | null>(null);
  const getSession = useCallback((): Session => {
    sessionRef.current ??= createSession();
    return sessionRef.current;
  }, []);

  const signedIn = state.status === 'authenticated';

  // Who is this? Runs once per page load.
  useEffect(() => {
    const { api, store, refresh } = getSession();
    const controller = new AbortController();

    // A session left idle past the limit while the browser was closed is over.
    if (isIdle(store.getLastActivity(), Date.now())) {
      store.clear();
      void api.auth.logout().catch(() => undefined);
      setState({ status: 'anonymous', reason: 'idle' });
      return;
    }

    const findUser = async (): Promise<User | null> => {
      const current = await api.auth.session(controller.signal);
      if (current.user !== null || !current.canRefresh) {
        return current.user;
      }
      // The access token has expired but a refresh token is still there: renew, then ask again.
      await refresh(store.getAccessExpiry());
      return (await api.auth.session(controller.signal)).user;
    };

    findUser()
      .then((user) => {
        if (user === null) {
          store.clear();
          setState({ status: 'anonymous' });
        } else {
          setState({ status: 'authenticated', user });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          store.clear();
          setState({ status: 'anonymous' });
        }
      });

    return () => {
      controller.abort();
    };
  }, [getSession]);

  const endSession = useCallback(
    async (reason: SignedOutReason): Promise<void> => {
      const { api, store } = getSession();
      store.clear();
      setState({ status: 'anonymous', reason });
      // The cookies are cleared by the API. If that call fails they still expire on their own.
      await api.auth.logout().catch(() => undefined);
    },
    [getSession],
  );

  // While signed in: watch for inactivity, follow a sign-out in another tab, renew before expiry.
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const { store, refresh } = getSession();
    if (store.getLastActivity() === null) {
      store.setLastActivity(Date.now());
    }

    const stopIdleMonitor = startIdleMonitor({
      store,
      now: () => Date.now(),
      target: window,
      onIdle: () => void endSession('idle'),
    });
    const stopListening = store.onClearedElsewhere(() => {
      setState({ status: 'anonymous', reason: 'signed-out' });
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRenewal = (): void => {
      const expiry = store.getAccessExpiry();
      // Unknown expiry (a page reload): renew soon, which also tells us the real one.
      const delay = expiry === null ? 5_000 : Math.max(expiry - Date.now() - REFRESH_AHEAD_MS, 0);
      timer = setTimeout(() => {
        // An idle tab must not keep its own session alive.
        if (isIdle(store.getLastActivity(), Date.now(), IDLE_LIMIT_MS)) {
          return;
        }
        refresh(expiry).then(scheduleRenewal, () => void endSession('expired'));
      }, delay);
    };
    scheduleRenewal();

    return () => {
      stopIdleMonitor();
      stopListening();
      clearTimeout(timer);
    };
  }, [signedIn, getSession, endSession]);

  const value = useMemo<AuthContextValue>(() => {
    const begin = async (start: (api: Api) => ReturnType<Api['auth']['login']>): Promise<void> => {
      const { api, store } = getSession();
      const session = await start(api);
      store.setAccessExpiry(Date.parse(session.accessTokenExpiresAt));
      store.setLastActivity(Date.now());
      setState({ status: 'authenticated', user: session.user });
    };

    return {
      state,
      get api() {
        return getSession().api;
      },
      login: (input) => begin((api) => api.auth.login(input)),
      register: (input) => begin((api) => api.auth.register(input)),
      continueAsGuest: () => begin((api) => api.auth.guest()),
      logout: () => endSession('signed-out'),
    };
  }, [state, getSession, endSession]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
