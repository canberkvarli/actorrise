"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";

/**
 * The two shelves under a piece.
 *
 * `/similar` has existed on the backend for the life of the product with no
 * frontend consumer at all — the recommender ran and nobody ever saw it. This
 * is that endpoint finally reaching a page.
 *
 * `/from-play` is new, and answers a different question. An actor reading
 * Hedda is usually deciding between Hedda's four speeches, not between Hedda
 * and a Strindberg, and until now the only route to the rest of the play was
 * back to search to type its name.
 */

export function useOthersFromPlay(monologueId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["monologue-from-play", monologueId ?? 0] as const,
    enabled: Boolean(monologueId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const res = await api.get<Monologue[]>(
        `/api/monologues/${monologueId}/from-play?limit=4`,
      );
      return res.data;
    },
  });
}

export function useSimilarPieces(monologueId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["monologue-similar", monologueId ?? 0] as const,
    enabled: Boolean(monologueId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const res = await api.get<Monologue[]>(
        `/api/monologues/${monologueId}/similar?limit=3`,
      );
      return res.data;
    },
  });
}
