"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";

// Popular pieces (by the recommender) — powers the pre-search "trending" module
// on /monologues: task-serving *and* light social proof, without a raw feed.
export function useTrending(limit = 6, enabled = true) {
  return useQuery<Monologue[]>({
    queryKey: ["trending-monologues", limit],
    queryFn: async () => {
      const res = await api.get<Monologue[]>(`/api/monologues/trending?limit=${limit}`);
      return res.data;
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
