"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import { shelfQuery, type ShareableScene, type ShelfFilters, type ShelfScene } from "@/lib/shelf";

const KEY = ["shelf"] as const;

type Page = { items: ShelfScene[]; total: number };

export function useShelf(filters: ShelfFilters, pageSize?: number) {
  return useInfiniteQuery<Page>({
    queryKey: [...KEY, "list", filters, pageSize ?? null],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page>(`/api/shelf${shelfQuery(filters, pageParam as number, pageSize)}`)).data,
    getNextPageParam: (last, pages) => {
      const seen = pages.reduce((n, p) => n + p.items.length, 0);
      return seen < last.total ? seen : undefined;
    },
    staleTime: 60_000,
  });
}

/** The actor's own scenes and where each stands; one script's when given. */
export function useShareable(enabled: boolean, scriptId?: number) {
  return useQuery<{ items: ShareableScene[] }>({
    queryKey: [...KEY, "shareable", scriptId ?? "all"],
    queryFn: async () =>
      (await api.get<{ items: ShareableScene[] }>(
        `/api/shelf/shareable${scriptId != null ? `?script_id=${scriptId}` : ""}`,
      )).data,
    enabled,
    staleTime: 30_000,
  });
}

/** "Not now", remembered per scene (shelf.py, /decline). */
export function useDecline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sceneIds: number[]) =>
      (await api.post<{ asks: Record<string, string> }>("/api/shelf/decline", { scene_ids: sceneIds })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMyShares() {
  return useQuery<{ contributor: boolean; opens: number; items: ShelfScene[] }>({
    queryKey: [...KEY, "mine"],
    queryFn: async () => (await api.get<{ contributor: boolean; opens: number; items: ShelfScene[] }>("/api/shelf/mine")).data,
    staleTime: 60_000,
  });
}

export type ShareInput = {
  scene_id: number;
  work_title: string;
  work_kind: "play" | "film" | "tv";
  author?: string;
  where: string;
  title?: string;
  tone?: string;
  show_name: boolean;
};

export function useShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ShareInput) => (await api.post<ShelfScene>("/api/shelf/share", input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/shelf/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "live" | "hidden" }) =>
      (await api.patch(`/api/shelf/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export type RehearseResult = {
  scene_id: number | null;
  bring_your_own: boolean;
  work_title?: string;
  where?: string | null;
};

export function useRehearseShelf() {
  return useMutation({
    mutationFn: async (id: number) => (await api.post<RehearseResult>(`/api/shelf/${id}/rehearse`)).data,
  });
}
