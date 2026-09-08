"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { WHATS_NEXT_QUERY_KEY } from "@/hooks/useWhatsNext";

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

/**
 * The shelf and the stage change together, so refresh them together.
 *
 * /practice reads two queries: the scripts on the shelf, and what to do next.
 * Anything that adds, removes or re-cuts a script changes both, and every
 * caller was refreshing only the first. Deleting a script took it off the shelf
 * and left "ready when you are" offering a scene out of it, with a Start it
 * button pointing at a scene that no longer existed. It righted itself on the
 * next refetch, which is the worst version of the bug: long enough to be seen,
 * short enough to be disbelieved.
 *
 * Re-cutting is the same defect through a worse door — it purges the old scenes
 * outright, so the stale rung is a link to something deleted.
 */
export function invalidateShelf(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: WHATS_NEXT_QUERY_KEY }),
  ]);
}

/**
 * A long script is read on the server after the upload returns, so the row
 * arrives as "processing" and finishes on its own time. Poll while that is
 * true and stop the moment it isn't — there is nothing to watch otherwise.
 */
const POLL_WHILE_READING = 5 * 1000;

const stillReading = (script?: Pick<UserScript, "processing_status">) =>
  script?.processing_status === "processing" || script?.processing_status === "pending";

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
    refetchInterval: (query) =>
      (query.state.data ?? []).some(stillReading) ? POLL_WHILE_READING : false,
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
    refetchInterval: (query) =>
      stillReading(query.state.data) ? POLL_WHILE_READING : false,
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

/**
 * Save the shelf the way the actor just dragged it.
 *
 * The drag has already happened on screen by the time this fires, so the cache
 * is moved to match before the request goes out and put back if it fails.
 * Waiting for the round trip would let the card snap back to where it was for
 * a moment, which reads as the drag not having worked.
 *
 * Only the actor's own scripts move. Samples belong to no one, so they keep
 * whatever slots they held in the cached list.
 */
export function useReorderScripts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scriptIds: number[]) => {
      const res = await api.patch<{ script_ids: number[] }>("/api/scripts/reorder", {
        script_ids: scriptIds,
      });
      return res.data.script_ids;
    },
    onMutate: async (scriptIds) => {
      await queryClient.cancelQueries({ queryKey: SCRIPTS_QUERY_KEY });
      const prev = queryClient.getQueryData<UserScript[]>(SCRIPTS_QUERY_KEY);
      queryClient.setQueryData<UserScript[]>(SCRIPTS_QUERY_KEY, (list) =>
        list ? reorderUserScripts(list, scriptIds) : list
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(SCRIPTS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SCRIPTS_QUERY_KEY });
    },
  });
}

/**
 * The cached list with the user's scripts in `scriptIds` order, and every
 * sample left in the slot it already occupied.
 */
export function reorderUserScripts(list: UserScript[], scriptIds: number[]): UserScript[] {
  const mine = new Map(list.filter((s) => !s.is_sample).map((s) => [s.id, s]));
  const moved: UserScript[] = [];
  for (const id of scriptIds) {
    const script = mine.get(id);
    if (script && !moved.includes(script)) moved.push(script);
  }
  // Anything the caller didn't name keeps its place at the end, matching what
  // the server does with a list that has gone stale.
  for (const script of mine.values()) {
    if (!moved.includes(script)) moved.push(script);
  }

  let next = 0;
  return list.map((script) => (script.is_sample ? script : moved[next++] ?? script));
}

export function useDeleteScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scriptId: number) => {
      await api.delete(`/api/scripts/${scriptId}`);
      return scriptId;
    },
    onSuccess: (scriptId) => {
      invalidateShelf(queryClient);
      queryClient.removeQueries({ queryKey: ["scripts", scriptId] });
    },
  });
}
