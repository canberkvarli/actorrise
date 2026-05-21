"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface UserScript {
  id: number;
  title: string;
  author: string;
  description?: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  processing_status: "pending" | "processing" | "completed" | "failed";
  processing_error?: string;
  ai_extraction_completed: boolean;
  genre?: string;
  estimated_length_minutes?: number;
  num_characters: number;
  num_scenes_extracted: number;
  characters: Array<{
    name: string;
    gender?: string;
    age_range?: string;
    description?: string;
  }>;
  created_at: string;
  updated_at?: string;
  is_sample?: boolean;
  first_scene_title?: string | null;
  first_scene_description?: string | null;
  scene_titles?: string[];
}

export const SCRIPTS_QUERY_KEY = ["scripts"] as const;

export function useScripts() {
  return useQuery<UserScript[]>({
    queryKey: SCRIPTS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<UserScript[]>("/api/scripts/");
      return response.data;
    },
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useScript(id: number | null) {
  return useQuery<UserScript>({
    queryKey: ["scripts", id],
    queryFn: async () => {
      const response = await api.get<UserScript>(`/api/scripts/${id}`);
      return response.data;
    },
    enabled: id !== null,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
