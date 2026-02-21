"use client";

import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastBookmark } from "@/lib/toast";
import api from "@/lib/api";
import type { FilmTvReference } from "@/types/filmTv";

const QUERY_KEY = ["film-tv-favorites"] as const;

export function useFilmTvFavorites() {
  return useQuery<FilmTvReference[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<FilmTvReference[]>("/api/film-tv/favorites/my");
      return response.data;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useFilmTvFavoriteCount() {
  const { data, isLoading } = useFilmTvFavorites();
  return {
    count: data?.length ?? 0,
    isLoading,
  };
}

type ToggleFilmTvVars = {
  referenceId: number;
  isFavorited: boolean;
  refForOptimistic?: FilmTvReference;
};

export function useToggleFilmTvFavorite() {
  const queryClient = useQueryClient();
  const mutateRef = useRef<(v: ToggleFilmTvVars) => void>(() => {});

  const mutation = useMutation({
    mutationFn: async ({
      referenceId,
      isFavorited,
      refForOptimistic,
    }: {
      referenceId: number;
      isFavorited: boolean;
      refForOptimistic?: FilmTvReference;
    }) => {
      if (isFavorited) {
        await api.delete(`/api/film-tv/references/${referenceId}/favorite`);
      } else {
        await api.post(`/api/film-tv/references/${referenceId}/favorite`);
      }
      return { referenceId, isFavorited: !isFavorited };
    },
    onMutate: async (variables) => {
      const { referenceId, isFavorited, refForOptimistic } = variables;
      const nextFavorited = !isFavorited;
      const previous = queryClient.getQueryData<FilmTvReference[]>(QUERY_KEY);
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });

      if (nextFavorited && refForOptimistic) {
        queryClient.setQueryData<FilmTvReference[]>(QUERY_KEY, (old) =>
          old ? [refForOptimistic, ...old] : [refForOptimistic]
        );
      } else if (!nextFavorited) {
        queryClient.setQueryData<FilmTvReference[]>(QUERY_KEY, (old) =>
          old ? old.filter((r) => r.id !== referenceId) : []
        );
      }
      return { previous };
    },
    onSuccess: (_data, variables) => {
      const nextFavorited = !variables.isFavorited;
      const typeLabel =
        variables.refForOptimistic?.type === "movie"
          ? "Movie"
          : variables.refForOptimistic?.type === "tvSeries"
            ? "TV show"
            : "Film & TV";
      toastBookmark(nextFavorited, {
        duration: 5000,
        label: typeLabel,
        onUndo: () => mutateRef.current({
          referenceId: variables.referenceId,
          isFavorited: nextFavorited,
          refForOptimistic: variables.refForOptimistic,
        }),
      });
    },
    onError: (_err, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      toast.error("Couldn't update saved. Please try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  mutateRef.current = mutation.mutate;
  return mutation;
}
