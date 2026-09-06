"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface Beat {
  segment_index: number;
  body: string;
  anchor_text?: string | null;
}

export function beatsKey(monologueId: number) {
  return ["monologue-beats", monologueId] as const;
}

/** The actor's margin notes on one piece, keyed by the line they sit on. */
export function useBeats(monologueId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: beatsKey(monologueId ?? 0),
    enabled: Boolean(monologueId) && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get<Beat[]>(`/api/monologues/${monologueId}/beats`);
      return res.data;
    },
    /* A signed-out reader gets a 401 here. That is not worth a retry storm, and
       the page is perfectly usable without notes. */
    retry: false,
  });
}

/**
 * Write, replace, or clear one margin note. An empty body clears it.
 *
 * Optimistic: the note appears the instant it is typed. Marking a beat is
 * meant to feel like writing on the page, and a page does not wait for a
 * round-trip before showing you your own handwriting.
 */
export function useSaveBeat(monologueId: number) {
  const queryClient = useQueryClient();
  const key = beatsKey(monologueId);

  return useMutation({
    mutationFn: async ({
      segmentIndex,
      body,
      anchorText,
    }: {
      segmentIndex: number;
      body: string;
      anchorText?: string;
    }) => {
      await api.put(`/api/monologues/${monologueId}/beats/${segmentIndex}`, {
        body,
        anchor_text: anchorText ?? null,
      });
      return { segmentIndex, body };
    },
    onMutate: async ({ segmentIndex, body, anchorText }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Beat[]>(key) ?? [];
      const trimmed = body.trim();
      const next = previous.filter((b) => b.segment_index !== segmentIndex);
      if (trimmed) {
        next.push({
          segment_index: segmentIndex,
          body: trimmed,
          anchor_text: anchorText ?? null,
        });
        next.sort((a, b) => a.segment_index - b.segment_index);
      }
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // The collection card counts a piece as worked-on once it carries marks.
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}
