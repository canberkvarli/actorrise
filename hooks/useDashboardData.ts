"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import type { FilmTvReference } from "@/types/filmTv";

interface ProfileStats {
  completion_percentage: number;
  has_headshot: boolean;
  preferred_genres_count: number;
  profile_bias_enabled: boolean;
}

interface ActorProfile {
  name?: string | null;
  headshot_url?: string | null;
}

const DASHBOARD_REQUEST_TIMEOUT_MS = 12_000; // avoid stuck loading after sign-in if API is slow

// Hook for profile stats
export function useProfileStats() {
  return useQuery<ProfileStats>({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const response = await api.get<ProfileStats>("/api/profile/stats", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

// Hook for profile data (backend returns 200 with empty profile when none exists)
export function useProfile() {
  return useQuery<ActorProfile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const response = await api.get<ActorProfile & { id?: number }>("/api/profile", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      const data = response.data;
      // Backend returns id=0 when no profile row exists; treat as null for display
      if (data && (data as { id?: number }).id === 0) {
        return null;
      }
      return data as ActorProfile;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  });
}

// Hook for discover monologues (no profile required – used when profile incomplete)
export function useDiscover(enabled: boolean = true) {
  return useQuery<Monologue[]>({
    queryKey: ["discover"],
    queryFn: async () => {
      const response = await api.get<Monologue[]>("/api/monologues/discover?limit=6", { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Hook for recommendations (fast=true uses SQL-only for quicker dashboard load; requires profile)
export function useRecommendations(enabled: boolean = true, fast: boolean = true) {
  return useQuery<Monologue[]>({
    queryKey: ["recommendations", fast],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "4" });
      if (fast) params.set("fast", "true");
      const response = await api.get<Monologue[]>(`/api/monologues/recommendations?${params}`, { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS });
      return response.data;
    },
    enabled, // Only fetch if profile is complete enough
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

// Hook for discover Film & TV. Not profile-based: no query returns top by IMDb rating.
// For profile-based film/TV recommendations we’d need a dedicated backend endpoint (e.g. by preferred genres).
export function useDiscoverFilmTv(enabled: boolean = true) {
  return useQuery<FilmTvReference[]>({
    queryKey: ["discover-film-tv"],
    queryFn: async () => {
      const response = await api.get<{ results: FilmTvReference[]; total: number }>(
        "/api/film-tv/search?limit=6",
        { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS }
      );
      return response.data.results;
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Hook for updating profile (with cache invalidation)
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData: any) => {
      const response = await api.post("/api/profile", profileData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate profile-related queries
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
