"use client";

import { useQuery } from "@tanstack/react-query";
import api, { API_URL } from "@/lib/api";

export interface FoundingActorPublic {
  id: number;
  name: string;
  slug: string;
  descriptor?: string;
  bio?: string;
  quote?: string;
  social_links: Record<string, string>;
  headshots: { url: string; is_primary?: boolean; caption?: string }[];
  display_order: number;
  source?: string;
}

/** Fetch all published founding actors (public, no auth). */
export function useFoundingActors() {
  return useQuery<FoundingActorPublic[]>({
    queryKey: ["founding-actors"],
    queryFn: async () => {
      const res = await api.get<FoundingActorPublic[]>("/api/founding-actors");
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}

/** Fetch a single founding actor by slug (public). */
export function useFoundingActor(slug: string) {
  return useQuery<FoundingActorPublic>({
    queryKey: ["founding-actors", slug],
    queryFn: async () => {
      const res = await api.get<FoundingActorPublic>(
        `/api/founding-actors/${slug}`,
      );
      return res.data;
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Fetch the current user's founding actor profile (authenticated). */
export function useMyFoundingActor() {
  return useQuery<FoundingActorPublic | null>({
    queryKey: ["founding-actors", "me"],
    queryFn: async () => {
      try {
        const res = await api.get<FoundingActorPublic>("/api/founding-actors/me");
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}
