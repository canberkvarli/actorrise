"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import api from "./api";
import { setStoredLastAuthMethod } from "./last-auth-method";

interface User {
  id: number;
  email: string;
  name?: string;
  marketing_opt_in?: boolean;
  has_seen_welcome?: boolean;
  has_seen_search_tour?: boolean;
  has_seen_profile_tour?: boolean;
  is_moderator?: boolean;
  can_approve_submissions?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isLoggingOut: boolean;
  login: (email: string, password: string, redirectTo?: string) => Promise<void>;
  signup: (email: string, password: string, name?: string, marketingOptIn?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOGOUT_TRANSITION_MS = 420;

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
      const response = await api.get<User>("/api/auth/me", { timeoutMs: 8000 });
      setUser(response.data);
    } catch (error: unknown) {
      console.error("Failed to sync user with backend:", error);
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
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await syncUserWithBackend(true);
          } else {
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
        syncUserWithBackend(false);
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

      // Sync with backend (don't set loading to prevent flickering)
      await syncUserWithBackend(false);

      setStoredLastAuthMethod("email");

      // Full page redirect so session cookies are sent on the next request (e.g. /search).
      // router.push() is client-only and can leave middleware without cookies on first nav.
      const redirectPath = redirectTo || "/dashboard";
      window.location.href = redirectPath;
    } catch (error: unknown) {
      console.error("Login error:", error);
      const message = error instanceof Error ? error.message : "Failed to login";
      throw new Error(message);
    }
  }, [syncUserWithBackend]);

  const signup = useCallback(async (email: string, password: string, name?: string, marketingOptIn?: boolean) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || null,
            marketing_opt_in: marketingOptIn === true,
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
        await syncUserWithBackend(false);
        setStoredLastAuthMethod("email");
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
  }, [syncUserWithBackend, router]);

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
    setUser(null);

    // Brief delay so UI can play fade-out animation before redirect
    await new Promise((r) => setTimeout(r, LOGOUT_TRANSITION_MS));
    window.location.href = "/auth/signout?redirect=/";
  }, [isLoggingOut]);

  const refreshUser = useCallback(async () => {
    await syncUserWithBackend(false);
  }, [syncUserWithBackend]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      isLoggingOut,
      login,
      signup,
      logout,
      refreshUser,
      isAuthenticated: !!user,
    }),
    [user, loading, isLoggingOut, login, signup, logout, refreshUser]
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
