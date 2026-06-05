"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastBookmark } from "@/lib/toast";
import api from "@/lib/api";
import type { SceneResponse } from "@/hooks/useLibraryScenes";

interface ToggleResult {
  favorited: boolean;
}

/**
 * Toggle a scene's favorite status via `POST /api/scenes/{id}/favorite`.
 * Optimistically flips `is_favorited` across every cached library + saved list,
 * then invalidates on settle so the server is the source of truth.
 */
export function useToggleSceneFavorite() {
  const queryClient = useQueryClient();

  return useMutation<ToggleResult, Error, { sceneId: number; isFavorited: boolean }, { snapshots: [readonly unknown[], unknown][] }>(
    {
      mutationFn: async ({ sceneId }) => {
        const response = await api.post<ToggleResult>(`/api/scenes/${sceneId}/favorite`);
        return response.data;
      },
      onMutate: async ({ sceneId, isFavorited }) => {
        const nextFavorited = !isFavorited;
        await queryClient.cancelQueries({ queryKey: ["library-scenes"] });
        await queryClient.cancelQueries({ queryKey: ["saved-scenes"] });

        const snapshots: [readonly unknown[], unknown][] = [];

        // Flip is_favorited in every cached library list (one per filter combo).
        for (const query of queryClient.getQueryCache().findAll({ queryKey: ["library-scenes"] })) {
          const data = query.state.data as SceneResponse[] | undefined;
          if (!data) continue;
          snapshots.push([query.queryKey, data]);
          queryClient.setQueryData<SceneResponse[]>(
            query.queryKey,
            data.map((s) => (s.id === sceneId ? { ...s, is_favorited: nextFavorited } : s)),
          );
        }

        // Update the saved-scenes list: drop on unfavorite, flip flag on favorite.
        const saved = queryClient.getQueryData<SceneResponse[]>(["saved-scenes"]);
        if (saved) {
          snapshots.push([["saved-scenes"], saved]);
          queryClient.setQueryData<SceneResponse[]>(
            ["saved-scenes"],
            nextFavorited
              ? saved.map((s) => (s.id === sceneId ? { ...s, is_favorited: true } : s))
              : saved.filter((s) => s.id !== sceneId),
          );
        }

        return { snapshots };
      },
      onError: (_err, _vars, context) => {
        if (context?.snapshots) {
          for (const [key, data] of context.snapshots) {
            queryClient.setQueryData(key, data);
          }
        }
        toast.error("Couldn't update bookmark. Please try again.");
      },
      onSuccess: (data) => {
        toastBookmark(data.favorited, { label: "Scene" });
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ["library-scenes"] });
        queryClient.invalidateQueries({ queryKey: ["saved-scenes"] });
      },
    },
  );
}
