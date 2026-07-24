"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface CommunityScript {
  id: number;
  title: string;
  author: string;
  genre?: string | null;
  owner_name: string;
  scene_count: number;
  character_count: number;
  scene_titles: string[];
  shared_at: string;
  is_demo: boolean;
}

export interface CommunityLibraryResponse {
  scripts: CommunityScript[];
  total: number;
  ready: boolean; // false → show the "still gathering scripts" cold-start state
}

// The Green Room community library — scripts actors have shared so their scenes
// can be rehearsed. Public endpoint (semi-anon owner name).
export function useCommunityLibrary() {
  return useQuery<CommunityLibraryResponse>({
    queryKey: ["community-library"],
    queryFn: async () => {
      const res = await api.get<CommunityLibraryResponse>("/api/community/scripts");
      return res.data;
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
