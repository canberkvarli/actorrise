"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";

/**
 * Toggle a monologue's "memorized" flag in the user's collection.
 * Marking memorized also adds it to the collection if it isn't already.
 * Optimistically updates the cached ["bookmarks"] collection list.
 */
export function useToggleMemorized() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      monologueId,
      memorized,
    }: {
      monologueId: number;
      memorized: boolean;
    }) => {
      await api.post(`/api/monologues/${monologueId}/memorized`, { memorized });
      return { monologueId, memorized };
    },
    onMutate: async ({ monologueId, memorized }) => {
      const prev = queryClient.getQueryData<Monologue[]>(["bookmarks"]);
      if (prev) {
        queryClient.setQueryData<Monologue[]>(
          ["bookmarks"],
          prev.map((m) => (m.id === monologueId ? { ...m, memorized } : m)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["bookmarks"], ctx.prev);
      toast.error("Couldn't update. Try again.");
    },
    onSuccess: ({ memorized }) => {
      toast.success(memorized ? "Marked as memorized" : "Moved back to study");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

export default useToggleMemorized;
