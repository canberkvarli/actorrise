"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";

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

// Hook for profile stats
export function useProfileStats() {
  return useQuery<ProfileStats>({
    queryKey: ["profile-stats"],
    queryFn: async () => {
      const response = await api.get<ProfileStats>("/api/profile/stats");
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
      const response = await api.get<ActorProfile & { id?: number }>("/api/profile");
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

// Hook for recommendations (fast=true uses SQL-only for quicker dashboard load)
export function useRecommendations(enabled: boolean = true, fast: boolean = true) {
  return useQuery<Monologue[]>({
    queryKey: ["recommendations", fast],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "4" });
      if (fast) params.set("fast", "true");
      const response = await api.get<Monologue[]>(`/api/monologues/recommendations?${params}`);
      return response.data;
    },
    enabled, // Only fetch if profile is complete enough
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
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
