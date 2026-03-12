"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import api, { primeSessionCache } from "./api";
import { setStoredLastAuthMethod } from "./last-auth-method";
import { clearSwrCache, clearReactQueryCache, clearUserSpecificQueryCache } from "./swrCache";

interface User {
  id: number;
  email: string;
  name?: string;
  has_seen_welcome?: boolean;
  has_seen_search_tour?: boolean;
  has_seen_profile_tour?: boolean;
  is_moderator?: boolean;
  can_approve_submissions?: boolean;
  is_founding_actor?: boolean;
}

const DEMO_EMAIL = "demo@actorrise.com";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoggingOut: boolean;
  isDemoUser: boolean;
  login: (email: string, password: string, redirectTo?: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOGOUT_TRANSITION_MS = 420;
const USER_CACHE_KEY = "actorrise_user_v1";

function getCachedUser(): User | null {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user: User | null) {
  try {
    if (user) sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const isInitializedRef = useRef(false);
  const lastSyncRef = useRef(0);

  const syncUserWithBackend = useCallback(async (shouldSetLoading = false) => {
    const now = Date.now();
    if (now - lastSyncRef.current < 3000) {
      if (shouldSetLoading) setLoading(false);
      return;
    }
    lastSyncRef.current = now;
    try {
      const response = await api.get<User>("/api/auth/me", { timeoutMs: 10000 });
      setUser(response.data);
      setCachedUser(response.data);
    } catch (error: unknown) {
      console.warn("[auth] Could not reach backend, using session fallback:", error);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser({
            id: 0,
            email: session.user.email ?? "",
            name: session.user.user_metadata?.name ?? undefined,
          });
        }
      } catch {
        // ignore
      }
    } finally {
      if (shouldSetLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check initial session once
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;

      // Load cached user immediately — no spinner for returning users
      const cached = getCachedUser();
      if (cached) {
        setUser(cached);
        setLoading(false);
      }

      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Prime the API session cache so dashboard queries don't re-fetch session
            if (session.access_token && session.expires_at) {
              primeSessionCache(session.access_token, session.expires_at);
            }
            // Revalidate in background (no spinner if we had cached data)
            await syncUserWithBackend(!cached);
          } else {
            setCachedUser(null);
            if (cached) setUser(null);
            setLoading(false);
          }
        } catch {
          setLoading(false);
        }
      })();
    }

    // Listen for auth changes (sign-in, sign-out, token refresh — but NOT initial session)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // already handled above
      if (session) {
        // Prime API session cache so subsequent requests use this token immediately
        if (session.access_token && session.expires_at) {
          primeSessionCache(session.access_token, session.expires_at);
        }
        // Fire-and-forget — must catch to prevent unhandled promise rejection
        syncUserWithBackend(false).catch(() => {});
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [syncUserWithBackend]);

  const login = useCallback(async (email: string, password: string, redirectTo?: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.session) {
        throw new Error("No session received");
      }

      // Prefill cache from session metadata so dashboard shows instantly after redirect.
      // AuthProvider will revalidate with backend in background (gets is_moderator, etc).
      setCachedUser({
        id: 0,
        email: data.session.user.email ?? email,
        name: data.session.user.user_metadata?.name ?? data.session.user.user_metadata?.full_name ?? undefined,
      });

      setStoredLastAuthMethod("email");
      clearSwrCache();
      clearUserSpecificQueryCache(); // only wipe profile/stats — keep discover cache for instant load

      // Full page redirect so session cookies are sent on the next request (e.g. /search).
      // router.push() is client-only and can leave middleware without cookies on first nav.
      const redirectPath = redirectTo || "/dashboard";
      window.location.href = redirectPath;
    } catch (error: unknown) {
      console.error("Login error:", error);
      const message = error instanceof Error ? error.message : "Failed to login";
      throw new Error(message);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    try {
      // Sign out any existing session first so a previously-cached user
      // (e.g. from Google OAuth) doesn't bleed into the new account.
      await supabase.auth.signOut();
      setCachedUser(null);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || null,
          },
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists")) {
          throw new Error("An account with this email already exists. Sign in instead.");
        }
        throw new Error(error.message);
      }

      if (!data.user) {
        throw new Error("Failed to create user account");
      }

      // If session exists, user is auto-confirmed (email confirmation disabled)
      if (data.session) {
        setCachedUser({
          id: 0,
          email: data.session.user.email ?? email,
          name: name ?? data.session.user.user_metadata?.name ?? undefined,
        });
        setStoredLastAuthMethod("email");
        clearSwrCache();
        clearUserSpecificQueryCache(); // only wipe profile/stats — keep discover cache for instant load
        // Full page redirect so session cookies are sent on the next request and modal state is cleared
        // Using router.push() leaves the auth modal open because React state persists
        window.location.href = "/dashboard";
      } else {
        // Email confirmation required - show success message
        // User will need to confirm email before logging in
        throw new Error("Please check your email to confirm your account before signing in.");
      }
    } catch (error: unknown) {
      console.error("Signup error:", error);
      const message = error instanceof Error ? error.message : "Failed to sign up";
      throw new Error(message);
    }
  }, [router]);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    // Clear search-related session storage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('search_results_') || key.startsWith('monologue_search_') || key.startsWith('film_tv_') || key === 'search_last_mode_v1')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (e) {
      console.error('Failed to clear session storage:', e);
    }

    await supabase.auth.signOut();
    setCachedUser(null);
    clearSwrCache();
    clearReactQueryCache();
    setUser(null);

    // Brief delay so UI can play fade-out animation before redirect
    await new Promise((r) => setTimeout(r, LOGOUT_TRANSITION_MS));
    window.location.href = "/auth/signout?redirect=/";
  }, [isLoggingOut]);

  const refreshUser = useCallback(async () => {
    await syncUserWithBackend(false);
  }, [syncUserWithBackend]);

  const isDemoUser = !!user && user.email === DEMO_EMAIL;

  // Developer login gets full admin/moderator access
  const effectiveUser = isDemoUser && user
    ? { ...user, is_moderator: true, can_approve_submissions: true }
    : user;

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user: effectiveUser,
      loading,
      isLoggingOut,
      isDemoUser,
      login,
      signup,
      logout,
      refreshUser,
      isAuthenticated: !!user,
    }),
    [effectiveUser, loading, isLoggingOut, isDemoUser, login, signup, logout, refreshUser]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
