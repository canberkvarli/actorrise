"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { ContentRequestItem } from "./shared";

/**
 * Turn a failing search into a tracked content request.
 *
 * Spotting "we don't have Mean Girls" in the logs and then retyping it into a
 * request list is the kind of friction that means it never gets logged at all.
 * The backend dedupes on (title, author), so tracking something actors already
 * requested bumps that row instead of creating a twin.
 */
export function useTrackQuery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (query: string) => {
      const res = await api.post<{ created: boolean; request: ContentRequestItem }>(
        "/api/admin/content-requests",
        { play_title: query, status: "planned" }
      );
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-content-requests"] }),
  });
}
