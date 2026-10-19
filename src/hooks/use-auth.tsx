import { isAuthApiError, type Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getPersistedSession, supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  user: Session['user'] | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // True only once we've confirmed there really is no session — an explicit
  // SIGNED_OUT event, or a genuine AuthApiError (a real response *from*
  // Supabase rejecting the refresh token, e.g. it was revoked). Never set on
  // a network failure or any other ambiguous error: this app is
  // offline-first, and being unable to verify a session because there's no
  // connectivity is not the same as being signed out. Guards every place
  // that would otherwise clear `session`.
  const confirmedSignedOut = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // A browser's first visit has no locally persisted session. In that
    // case Supabase may still try an online refresh, which must never keep
    // the whole application on its startup screen forever if the request is
    // delayed by a captive portal, privacy extension, or a transient DNS
    // problem. The eventual response is still observed below; this merely
    // allows the sign-in screen to appear promptly in the meantime.
    const initialLoadTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 2500);

    // Network-independent first paint: what Supabase last persisted to
    // disk, read directly. getSession() itself refuses to return a session
    // once the access token's real expiry has passed if it can't reach the
    // network to refresh — which, for someone who left wifi hours ago, is
    // the common case, not an edge case. Local SQLite is this app's real
    // source of truth, so a stale-but-present session is enough to open the
    // app; only PowerSync's own upload path needs a genuinely fresh token,
    // and it fetches its own credentials independently either way.
    async function loadPersisted() {
      const persisted = await getPersistedSession();
      if (cancelled || confirmedSignedOut.current || persisted === null) return;
      setSession(persisted);
      setLoading(false);
    }

    // Best-effort network refresh, layered on top of the above. Success
    // replaces whatever we have with a fresh session. Failure only clears
    // the session when it's unambiguous (a real AuthApiError response, or
    // SIGNED_OUT below) — any other error (no connectivity, timeout,
    // Supabase down) just leaves the current session as-is.
    async function refresh() {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        confirmedSignedOut.current = false;
        setSession(data.session);
        setLoading(false);
        return;
      }
      if (error && isAuthApiError(error)) {
        confirmedSignedOut.current = true;
        setSession(null);
      }
      setLoading(false);
    }

    loadPersisted().then(refresh);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        confirmedSignedOut.current = true;
        setSession(null);
        setLoading(false);
        return;
      }
      // Offline startup can emit INITIAL_SESSION with null when Supabase
      // cannot refresh an expired access token. That is not a sign-out and
      // must not erase the stale-but-valid local identity loaded above.
      if (nextSession) {
        confirmedSignedOut.current = false;
        setSession(nextSession);
      }
      setLoading(false);
    });

    // React Native suspends JS timers while backgrounded, so the client's
    // internal refresh ticker doesn't run and tokens can go stale while the
    // phone is locked/away — this is Supabase's documented RN pattern to
    // drive refresh off AppState instead. On resume, also re-check in case
    // the token needs refreshing after being away.
    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        if (!confirmedSignedOut.current) refresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }

    return () => {
      cancelled = true;
      clearTimeout(initialLoadTimeout);
      authListener.subscription.unsubscribe();
      appStateListener.remove();
    };
  }, []);

  const value: AuthState = { session, user: session?.user ?? null, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
