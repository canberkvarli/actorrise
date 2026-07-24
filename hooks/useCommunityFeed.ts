"use client";

import { useQuery } from "@tanstack/react-query";
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
