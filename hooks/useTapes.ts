"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface Tape {
  id: number;
  title: string | null;
  notes: string | null;
  duration_seconds: number | null;
  file_path: string;
  file_size_bytes: number | null;
  share_uuid: string;
  is_shared: boolean;
  ai_feedback: AuditionFeedback | null;
  created_at: string;
  updated_at: string;
}

export interface AuditionFeedback {
  rating: number;
  lineAccuracy: string;
  pacing: string;
  emotionalTone: string;
  framing: string;
  tips: string[];
}

export interface TapeListResponse {
  tapes: Tape[];
  count: number;
  limit: number;
}

export const TAPES_QUERY_KEY = ["tapes"] as const;

export function useTapes() {
  return useQuery<TapeListResponse>({
    queryKey: TAPES_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<TapeListResponse>("/api/tapes");
      return response.data;
    },
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useTape(id: number | null) {
  return useQuery<Tape>({
    queryKey: ["tapes", id],
    queryFn: async () => {
      const response = await api.get<Tape>(`/api/tapes/${id}`);
      return response.data;
    },
    enabled: id !== null,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useCreateTape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title?: string;
      notes?: string;
      duration_seconds?: number;
      file_path: string;
      file_size_bytes?: number;
      monologue_id?: number;
      script_id?: number;
    }) => {
      const response = await api.post<Tape>("/api/tapes", data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAPES_QUERY_KEY });
    },
  });
}

export function useUpdateTape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number;
      title?: string;
      notes?: string;
    }) => {
      const response = await api.patch<Tape>(`/api/tapes/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAPES_QUERY_KEY });
    },
  });
}

export function useDeleteTape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/tapes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAPES_QUERY_KEY });
    },
  });
}

export function useShareTape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.post<{ share_url: string }>(
        `/api/tapes/${id}/share`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAPES_QUERY_KEY });
    },
  });
}

export function useUnshareTape() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/tapes/${id}/share`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAPES_QUERY_KEY });
    },
  });
}
