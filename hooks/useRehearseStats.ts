"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface RatingTrendPoint {
  date: string | null;
  rating: number;
}

export interface AreaToImprove {
  area: string;
  count: number;
}

export interface RehearseStats {
  total_sessions: number;
  completed_sessions: number;
  average_rating: number | null;
  current_streak: number;
  longest_streak: number;
  rating_trend: RatingTrendPoint[];
  top_areas_to_improve: AreaToImprove[];
}

export const REHEARSE_STATS_QUERY_KEY = ["rehearse", "stats"] as const;

export function useRehearseStats() {
  return useQuery<RehearseStats>({
    queryKey: REHEARSE_STATS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<RehearseStats>("/api/scenes/rehearse/stats");
      return response.data;
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
