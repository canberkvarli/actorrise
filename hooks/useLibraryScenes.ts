"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/** A scene as returned by the backend scenes endpoints (SceneResponse). */
export interface SceneResponse {
  id: number;
  play_id: number;
  play_title: string;
  play_author: string;
  title: string;
  act: string | null;
  scene_number: string | null;
  description: string | null;
  character_1_name: string | null;
  character_2_name: string | null;
  character_1_gender: string | null;
  character_2_gender: string | null;
  difficulty_level: string | null;
  primary_emotions: string[];
  relationship_dynamic: string | null;
  tone: string | null;
  line_count: number | null;
  estimated_duration_seconds: number | null;
  is_library: boolean;
  /** True when a library scene is in the free-tier starter set. */
  is_free_library: boolean;
  is_favorited: boolean;
}

export interface LibrarySceneFilters {
  /** Difficulty filter ("beginner" | "intermediate" | "advanced"); omit/undefined for All. */
  difficulty?: string;
  /** Free-text search across title / play / character. */
  q?: string;
}

/** Stable query key for the library scene list so mutations can invalidate it. */
export function libraryScenesKey(filters: LibrarySceneFilters) {
  return [
    "library-scenes",
    { difficulty: filters.difficulty, q: filters.q },
  ] as const;
}

/**
 * Fetch the curated scene library via `GET /api/scenes/?library_only=true`.
 * Mirrors useScripts conventions (staleTime / gcTime / retry).
 */
export function useLibraryScenes(filters: LibrarySceneFilters = {}) {
  const { difficulty, q } = filters;
  return useQuery<SceneResponse[]>({
    queryKey: libraryScenesKey(filters),
    queryFn: async () => {
      const params = new URLSearchParams({
        library_only: "true",
        limit: "100",
      });
      if (difficulty) params.set("difficulty", difficulty);
      if (q && q.trim()) params.set("q", q.trim());
      const response = await api.get<SceneResponse[]>(`/api/scenes/?${params.toString()}`);
      return response.data;
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/** Saved (favorited) scenes for the current user. */
export const SAVED_SCENES_KEY = ["saved-scenes"] as const;

export function useSavedScenes() {
  return useQuery<SceneResponse[]>({
    queryKey: SAVED_SCENES_KEY,
    queryFn: async () => {
      const response = await api.get<SceneResponse[]>("/api/scenes/favorites/my");
      return response.data;
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
