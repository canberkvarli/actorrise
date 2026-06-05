"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * Mirrors the backend `RehearsalSessionResponse` schema exactly
 * (backend/app/api/scenes.py). The list endpoint returns these fields only.
 */
export interface RehearseSession {
  id: number;
  scene_id: number;
  user_character: string;
  ai_character: string;
  status: string;
  current_line_index: number;
  total_lines_delivered: number;
  max_lines: number | null;
  completion_percentage: number;
  started_at: string;
  first_line_for_user: string | null;
  current_line_for_user: string | null;
}

export const REHEARSE_SESSIONS_QUERY_KEY = ["rehearse", "sessions"] as const;

export function useRehearseSessions(limit = 20) {
  return useQuery<RehearseSession[]>({
    queryKey: [...REHEARSE_SESSIONS_QUERY_KEY, limit],
    queryFn: async () => {
      const response = await api.get<RehearseSession[]>(
        `/api/scenes/rehearse/sessions?limit=${limit}`,
      );
      return response.data;
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
