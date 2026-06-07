"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * Save the actor's notes on a monologue (adds it to the collection if needed).
 */
export function useSaveNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ monologueId, notes }: { monologueId: number; notes: string }) => {
      await api.post(`/api/monologues/${monologueId}/notes`, { notes });
      return { monologueId, notes };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/**
 * Touch last_studied_at for a monologue (no-op server-side if it's not in the
 * collection). Fire-and-forget when the memorize screen opens.
 */
export function useMarkStudied() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (monologueId: number) => {
      await api.post(`/api/monologues/${monologueId}/studied`, {});
      return monologueId;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/**
 * Save (or clear, with nulls) an audition cut (line range) for a monologue.
 */
export function useSaveCut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      monologueId,
      start,
      end,
    }: {
      monologueId: number;
      start: number | null;
      end: number | null;
    }) => {
      await api.post(`/api/monologues/${monologueId}/cut`, {
        start_line: start,
        end_line: end,
      });
      return { monologueId, start, end };
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({
        queryKey: ["monologue-memorize", String(vars.monologueId)],
      });
    },
  });
}
