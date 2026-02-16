"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import api from "./api";

interface User {
  id: number;
  email: string;
  name?: string;
  marketing_opt_in?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, redirectTo?: string) => Promise<void>;
  signup: (email: string, password: string, name?: string, marketingOptIn?: boolean) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);

  const syncUserWithBackend = useCallback(async (shouldSetLoading = false) => {
    try {
      // Sync user with backend to get our User model
      // Use a timeout so we don't get stuck on the loading screen if the backend is slow/unreachable in production.
      const response = await api.get<User>("/api/auth/me", { timeoutMs: 8000 });
      setUser(response.data);
      if (shouldSetLoading) {
        setLoading(false);
      }
    } catch (error: unknown) {
      console.error("Failed to sync user with backend:", error);
      // Backend unreachable or user not in DB yet: fall back to Supabase session so the app still shows as logged in
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
      if (shouldSetLoading) {
        setLoading(false);
      }
    }
  }, []);

  const checkAuth = useCallback(async () => {
    if (isInitialized) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        setIsInitialized(true);
        return;
      }

      await syncUserWithBackend(true);
      setIsInitialized(true);
    } catch (error: unknown) {
      console.error("Auth check failed:", error);
      setLoading(false);
      setIsInitialized(true);
    }
  }, [syncUserWithBackend, isInitialized]);

  useEffect(() => {
    // Check initial session only once
    if (!isInitialized) {
      checkAuth();
    }

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // Don't set loading on auth state changes to prevent flickering
        syncUserWithBackend(false);
      } else {
        setUser(null);
        // Only set loading if we're still initializing
        if (!isInitialized) {
          setLoading(false);
          setIsInitialized(true);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuth, syncUserWithBackend, isInitialized]);

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
        throw new Error(error.message);
      }

      if (!data.user) {
        throw new Error("Failed to create user account");
      }

      // If session exists, user is auto-confirmed (email confirmation disabled)
      if (data.session) {
        await syncUserWithBackend(false);
        // Send new users straight to dashboard; profile completion is optional via /profile
        router.push("/dashboard");
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
    await supabase.auth.signOut();
    setUser(null);

    // Clear search-related session storage on logout
    // Keep storage for page navigation, but clear on explicit logout
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('search_results_') || key.startsWith('monologue_search_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (e) {
      // Session storage might be unavailable
      console.error('Failed to clear session storage:', e);
    }

    // Use window.location to force full page navigation and bypass platform layout redirect
    window.location.href = "/";
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      login,
      signup,
      logout,
      isAuthenticated: !!user,
    }),
    [user, loading, login, signup, logout]
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
