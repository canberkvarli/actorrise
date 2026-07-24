"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export type CommunityEventType =
  | "joined"
  | "searched"
  | "viewed"
  | "bookmarked"
  | "worked"
  | "rehearsed"
  | "milestone"
  | "went_plus"
  | "trending";

export interface FeedEvent {
  id: number;
  event_type: CommunityEventType;
  name: string;
  city?: string | null;
  headshot_url?: string | null;
  payload: {
    tone?: string;
    gender?: string;
    age_range?: string;
    author?: string;
    emotion?: string;
    themes?: string[];
    title?: string;
    monologue_id?: number;
    source_type?: string;
    line_count?: number;
    milestone_n?: number;
    reader_count?: number;
  };
  created_at: string;
}

export interface FeedResponse {
  events: FeedEvent[];
  actor_count: number;
  window: "today" | "week";
}

// The feed is intentionally "live-ish", not hard-realtime: a gentle interval +
// window-focus refetch keeps it fresh without a polling storm or a Realtime
// subscription that would expose raw rows. New events animate in on the client.
export function useCommunityFeed(limit = 60) {
  return useQuery<FeedResponse>({
    queryKey: ["community-feed", limit],
    queryFn: async () => {
      const res = await api.get<FeedResponse>(`/api/community/feed?limit=${limit}`);
      return res.data;
    },
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 25 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

// The caller's own Green Room visibility + an optimistic toggle. Drives the
// "you're visible / hidden" control in the feed header.
export function useShareActivity() {
  const qc = useQueryClient();
  const query = useQuery<boolean>({
    queryKey: ["community-share"],
    queryFn: async () => {
      const res = await api.get<{ share_activity: boolean }>("/api/community/settings");
      return res.data.share_activity;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      await api.patch("/api/community/settings", { share_activity: next });
      return next;
    },
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: ["community-share"] });
      const prev = qc.getQueryData<boolean>(["community-share"]);
      qc.setQueryData(["community-share"], next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["community-share"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });

  return {
    shareActivity: query.data,
    isLoading: query.isLoading,
    setShareActivity: (v: boolean) => mutation.mutate(v),
  };
}
