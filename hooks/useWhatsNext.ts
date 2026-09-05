"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * The next real thing to do, for the top of the rehearsal room.
 *
 * A ladder, best rung first: work you left unfinished, then a scene ready to
 * start, then a script still waiting to be cut, then the sample play. Every
 * rung that can carry a line of dialogue does, so the screen always opens on a
 * piece of writing rather than a status message.
 */
export interface WhatsNext {
  rung: "resume" | "start" | "cut" | "demo";
  script: { id: number; title: string; genre?: string | null; is_sample: boolean } | null;
  scene: {
    id: number;
    title: string;
    act?: string | null;
    scene_number?: string | null;
  } | null;
  character: string | null;
  line: { character: string; text: string } | null;
  progress: { current: number; total: number } | null;
  session_id: number | null;
}

export const WHATS_NEXT_QUERY_KEY = ["scenes", "whats-next"] as const;

export function useWhatsNext() {
  return useQuery<WhatsNext | null>({
    queryKey: WHATS_NEXT_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<{ next: WhatsNext | null }>("/api/scenes/whats-next");
      return response.data.next;
    },
    // Cheap to recompute and it changes the moment they rehearse anything, so
    // keep it fresher than the script list without polling for it.
    staleTime: 15 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
