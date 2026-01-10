"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";

// Hook for fetching bookmarks
export function useBookmarks() {
  return useQuery<Monologue[]>({
    queryKey: ["bookmarks"],
    queryFn: async () => {
      const response = await api.get<Monologue[]>("/api/monologues/favorites/my");
      return response.data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
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
    onSuccess: (data) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      
      // Optimistically update recommendations cache
      queryClient.setQueryData<Monologue[]>(["recommendations"], (old) => {
        if (!old) return old;
        return old.map((mono) =>
          mono.id === data.monologueId
            ? {
                ...mono,
                is_favorited: data.isFavorited,
                favorite_count: data.isFavorited ? mono.favorite_count + 1 : mono.favorite_count - 1,
              }
            : mono
        );
      });
    },
  });
}
