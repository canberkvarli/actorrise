"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * The class shelf (backend services/class_shelf.py): scripts a teacher shared
 * with their own class. A student sees one shelf per teacher; everyone else
 * gets an empty list, never a hint of what is on someone else's.
 */
export interface ClassShelfScene {
  id: number;
  title: string;
  character_1_name: string;
  character_2_name: string;
  line_count: number;
  estimated_duration_seconds: number;
}

export interface ClassShelfScript {
  id: number;
  title: string;
  author: string;
  genre: string | null;
  scenes: ClassShelfScene[];
}

export interface ClassShelf {
  teacher: string;
  scripts: ClassShelfScript[];
}

export const CLASS_SHELF_QUERY_KEY = ["class-shelf"] as const;
export const MY_SHARING_QUERY_KEY = ["class-shelf", "mine"] as const;

export function useClassShelves() {
  return useQuery<ClassShelf[]>({
    queryKey: CLASS_SHELF_QUERY_KEY,
    queryFn: async () => (await api.get<{ shelves: ClassShelf[] }>("/api/class-shelf")).data.shelves,
    staleTime: 60_000,
  });
}

/** The teacher's side: whether they may share, and how many they have. */
export interface MySharing {
  can_share: boolean;
  shared: number;
}

export function useMySharing(enabled = true) {
  return useQuery<MySharing>({
    queryKey: MY_SHARING_QUERY_KEY,
    queryFn: async () => (await api.get<MySharing>("/api/class-shelf/mine")).data,
    enabled,
    staleTime: 60_000,
  });
}

export function useShareWithClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ scriptIds, on }: { scriptIds: number[]; on: boolean }): Promise<{ changed: number }> => {
      if (scriptIds.length === 1) {
        await api.put(`/api/class-shelf/scripts/${scriptIds[0]}`, { on });
        return { changed: 1 };
      }
      return (await api.put<{ changed: number }>("/api/class-shelf/scripts", { on, script_ids: scriptIds })).data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: MY_SHARING_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
  });
}
