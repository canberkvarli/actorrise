"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  shared_with_community?: boolean;
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
    // SWR: render cached list instantly, revalidate in background. Mutations
    // (upload/delete) already call invalidateQueries, so freshness is covered.
    staleTime: 30 * 1000,
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

// Share/unshare a script with the Green Room community library (optimistic).
export function useShareScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scriptId, shared }: { scriptId: number; shared: boolean }) => {
      const res = await api.patch<UserScript>(`/api/scripts/${scriptId}/share`, { shared });
      return res.data;
    },
    onMutate: async ({ scriptId, shared }) => {
      await queryClient.cancelQueries({ queryKey: SCRIPTS_QUERY_KEY });
      const prev = queryClient.getQueryData<UserScript[]>(SCRIPTS_QUERY_KEY);
      queryClient.setQueryData<UserScript[]>(SCRIPTS_QUERY_KEY, (list) =>
        (list ?? []).map((s) =>
          s.id === scriptId ? { ...s, shared_with_community: shared } : s
        )
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(SCRIPTS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["community-library"] });
    },
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scriptId: number) => {
      await api.delete(`/api/scripts/${scriptId}`);
      return scriptId;
    },
    onSuccess: (scriptId) => {
      queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
      queryClient.removeQueries({ queryKey: ["scripts", scriptId] });
    },
  });
}
