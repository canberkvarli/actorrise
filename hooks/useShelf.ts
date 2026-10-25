"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import { invalidateShelf } from "@/hooks/useScripts";
import { type ShareableScene, type ShelfScene } from "@/lib/shelf";

const KEY = ["shelf"] as const;

type Page = { items: ShelfScene[]; total: number };

/**
 * The whole library at once, for the Community library to filter in the
 * browser. Asked for when the library is about to open, not on every visit to
 * /practice: a few hundred rows of labels is cheap once and wasteful daily.
 */
export function useShelfAll(enabled: boolean) {
  return useQuery<Page>({
    queryKey: [...KEY, "all"],
    queryFn: async () => (await api.get<Page>("/api/shelf?limit=500")).data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** A classic onto the actor's own shelf, as a script of theirs. */
export function useAddToShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.post<{ script_id: number; scene_id: number; added: boolean }>(`/api/shelf/${id}/add`)).data,
    onSuccess: (r, id) => {
      // Say so on the card now; the shelf beside it catches up.
      qc.setQueryData<Page>([...KEY, "all"], (old) =>
        old ? { ...old, items: old.items.map((s) => (s.id === id ? { ...s, on_my_shelf: r.script_id } : s)) } : old,
      );
      return invalidateShelf(qc);
    },
  });
}

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
