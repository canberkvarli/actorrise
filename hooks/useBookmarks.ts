"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";

// Hook for fetching bookmarks (cached – shared with dashboard, My Monologues, etc.)
export function useBookmarks() {
  return useQuery<Monologue[]>({
    queryKey: ["bookmarks"],
    queryFn: async () => {
      const response = await api.get<Monologue[]>("/api/monologues/favorites/my");
      return response.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes – avoid refetch on every My Monologues visit
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

// Hook for bookmark count
export function useBookmarkCount() {
  const { data, isLoading } = useBookmarks();
  return {
    count: data?.length ?? 0,
    isLoading,
  };
}

const RECOMMENDATIONS_KEYS = [["recommendations", true], ["recommendations", false]] as const;

function applyFavoriteToMonologue(mono: Monologue, monologueId: number, isFavorited: boolean): Monologue {
  if (mono.id !== monologueId) return mono;
  return {
    ...mono,
    is_favorited: isFavorited,
    favorite_count: isFavorited ? mono.favorite_count + 1 : Math.max(0, mono.favorite_count - 1),
  };
}

// Hook for toggling favorite status
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ monologueId, isFavorited }: { monologueId: number; isFavorited: boolean }) => {
      if (isFavorited) {
        await api.delete(`/api/monologues/${monologueId}/favorite`);
      } else {
        await api.post(`/api/monologues/${monologueId}/favorite`);
      }
      return { monologueId, isFavorited: !isFavorited };
    },
    onMutate: async (variables) => {
      const { monologueId, isFavorited } = variables;
      const nextFavorited = !isFavorited;
      const previous: { key: unknown[]; data: unknown }[] = [];

      // Apply bookmarks cache update first (synchronously) so My Monologues list updates immediately
      const bookmarks = queryClient.getQueryData<Monologue[]>(["bookmarks"]);
      if (bookmarks !== undefined) {
        previous.push({ key: ["bookmarks"], data: bookmarks });
        if (nextFavorited) {
          const mono = queryClient.getQueryData<Monologue[]>(["recommendations", true])?.find((m) => m.id === monologueId)
            ?? queryClient.getQueryData<Monologue[]>(["discover"])?.find((m) => m.id === monologueId);
          if (mono) {
            queryClient.setQueryData<Monologue[]>(["bookmarks"], [
              { ...mono, is_favorited: true, favorite_count: (mono.favorite_count ?? 0) + 1 },
              ...bookmarks,
            ]);
          }
        } else {
          queryClient.setQueryData<Monologue[]>(["bookmarks"], bookmarks.filter((m) => m.id !== monologueId));
        }
      }

      // Update recommendations and discover caches so dashboard/sidebar reflect new state
      for (const key of RECOMMENDATIONS_KEYS) {
        const old = queryClient.getQueryData<Monologue[]>(key);
        if (old) {
          previous.push({ key, data: old });
          queryClient.setQueryData<Monologue[]>(key, (list) =>
            list ? list.map((m) => applyFavoriteToMonologue(m, monologueId, nextFavorited)) : list
          );
        }
      }
      const oldDiscover = queryClient.getQueryData<Monologue[]>(["discover"]);
      if (oldDiscover) {
        previous.push({ key: ["discover"], data: oldDiscover });
        queryClient.setQueryData<Monologue[]>(["discover"], (list) =>
          list ? list.map((m) => applyFavoriteToMonologue(m, monologueId, nextFavorited)) : list
        );
      }

      // Cancel in-flight refetches after optimistic update so they don't overwrite
      await queryClient.cancelQueries({ queryKey: ["recommendations"] });
      await queryClient.cancelQueries({ queryKey: ["discover"] });
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });

      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        for (const { key, data } of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["discover"] });
    },
  });
}
