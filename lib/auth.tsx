"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import api from "./api";

interface User {
  id: number;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check initial session
    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        syncUserWithBackend(session.user);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncUserWithBackend = async (supabaseUser: SupabaseUser) => {
    try {
      // Sync user with backend to get our User model
      const response = await api.get("/api/auth/me");
      setUser(response.data);
    } catch (error: any) {
      console.error("Failed to sync user with backend:", error);
      // User might not exist in backend yet, that's okay
      // It will be created on first API call
    } finally {
      setLoading(false);
    }
  };

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        return;
      }

      await syncUserWithBackend(session.user);
    } catch (error: any) {
      console.error("Auth check failed:", error);
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
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

      // Sync with backend
      await syncUserWithBackend(data.user);
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Login error:", error);
      throw new Error(error.message || "Failed to login");
    }
  };

  const signup = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.user) {
        throw new Error("Failed to create user account");
      }

      // If session exists, user is auto-confirmed (email confirmation disabled)
      if (data.session) {
        // Auto-login after signup
        await syncUserWithBackend(data.user);
        router.push("/dashboard");
      } else {
        // Email confirmation required - show success message
        // User will need to confirm email before logging in
        throw new Error("Please check your email to confirm your account before signing in.");
      }
    } catch (error: any) {
      console.error("Signup error:", error);
      throw new Error(error.message || "Failed to sign up");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
      }}
    >
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
