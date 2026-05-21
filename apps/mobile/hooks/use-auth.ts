import type { Session, User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

/**
 * Subscribes to Supabase auth state on mount. Returns the live session,
 * the user, a loading flag for the initial restore, and a sign-out helper.
 *
 * Use this anywhere a screen needs to know whether the user is signed in.
 * Phase 2 will wrap this in a context provider so the auth fetch happens
 * once per app launch instead of once per screen.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    isLoading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
