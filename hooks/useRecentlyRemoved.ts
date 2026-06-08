"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";

/** Monologues soft-deleted from the collection in the last 30 days (newest first). */
export function useRecentlyRemoved() {
  return useQuery<Monologue[]>({
    queryKey: ["recently-removed"],
    queryFn: async () => {
      const res = await api.get<Monologue[]>("/api/monologues/removed/my");
      return res.data;
    },
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    retry: 1,
  });
}

/** Restore a removed monologue back into the collection. */
export function useRestoreMonologue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (monologueId: number) => {
      await api.post(`/api/monologues/${monologueId}/restore`, {});
      return monologueId;
    },
    onSuccess: () => {
      toast.success("Restored to your collection");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["recently-removed"] });
    },
  });
}
